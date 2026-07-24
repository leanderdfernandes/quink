"""Regression guard for the video-to-article pipeline.

Answers two questions after any prompt/pipeline change: is the output good enough
to publish (>40% usable), and did this change break something that used to work.

Invocation model (see eval/README.md): the runner talks to the running worker over
HTTP for the ONE thing the worker owns — POST /api/generate. Everything else
(video upload, job status, the article, frames) lives in Supabase, because that is
the real product architecture (CLAUDE.md §4/§5): the worker has no jobs endpoint
and never returns the article over HTTP. The runner therefore uses supabase-py for
those, but it NEVER imports pipeline internals — it only reads what the worker wrote.

Per video: upload mp4 -> videos bucket -> POST /api/generate -> poll the jobs row
-> read articles+steps -> sign+fetch frames over HTTP -> score. One video's failure
is recorded and the run continues.
"""

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import httpx

from judge_prompt import JUDGE_MODEL, JUDGE_PROMPT

# --- Endpoint paths (named constants — CLAUDE.md §10) ------------------------
HEALTH_PATH = "/health"
GENERATE_PATH = "/api/generate"
DEFAULT_BASE_URL = "http://localhost:8000"

# --- Supabase surface the worker writes to ----------------------------------
JOBS_TABLE = "jobs"
ARTICLES_TABLE = "articles"
STEPS_TABLE = "steps"
KB_TABLE = "knowledge_bases"
BUCKET_VIDEOS = "videos"
BUCKET_FRAMES = "frames"
SIGNED_URL_TTL = 600  # seconds; long enough to fetch every frame in one run

# --- Scoring config ---------------------------------------------------------
USABLE_TARGET = 0.40                 # headline gate
BLANK_FRAME_FRACTION = 0.95          # >this share of one exact colour = blank/solid
# ponytail: exact-colour histogram on a frame downscaled to 480px wide. A nearly
# empty (mostly-white) real UI page can trip this; the 0.95 threshold keeps that
# rare. Upgrade path: perceptual/edge-density check if false positives show up.
FRAME_HIST_WIDTH = 480

JUDGE_DIMS = [
    "segmentation", "faithfulness", "timestamp_accuracy",
    "frame_relevance", "terminology", "instructional_quality",
]
CSV_HEADER = [
    "run_id", "prompt_version", "video_id", "segmentation", "faithfulness",
    "timestamp_accuracy", "frame_relevance", "terminology",
    "instructional_quality", "pii_pass", "injection_pass", "frame_validity",
    "step_count_delta", "usable_verdict", "notes",
]

EVAL_DIR = Path(__file__).resolve().parent


# --- Ground truth -----------------------------------------------------------
def _field(text: str, *names: str) -> str | None:
    """First `name: value` line (case-insensitive) for any of `names`."""
    import re
    for name in names:
        m = re.search(rf"(?im)^\s*{re.escape(name)}\s*[:=]\s*(.+?)\s*$", text)
        if m:
            return m.group(1).strip()
    return None


def _parse_context(text: str) -> dict:
    """Context block: either an inline { name: "...", audience: "..." } (EVAL-PLAN
    §2 style) or plain `key: value` lines under a Context heading. Tolerant of
    both. product_name/name are treated as the same key."""
    import re
    ctx = {"product_name": "", "audience": "", "tone": "", "description": ""}
    key_map = {"name": "product_name", "product_name": "product_name",
               "product": "product_name", "audience": "audience",
               "tone": "tone", "description": "description"}
    # Inline JSON-ish braces, if present.
    m = re.search(r"(?is)context[^\n{]*\{(.+?)\}", text)
    blob = m.group(1) if m else text
    for k, v in re.findall(r'(?i)"?([a-z_ ]+?)"?\s*[:=]\s*"([^"]*)"', blob):
        key = key_map.get(k.strip().lower())
        if key:
            ctx[key] = v.strip()
    # Fallback: bare `key: value` lines (unquoted) for the four known keys.
    for raw, key in key_map.items():
        if not ctx[key]:
            v = _field(text, raw)
            if v:
                ctx[key] = v.strip().strip('"').strip("{},")
    return ctx


def parse_ground_truth(path: Path) -> dict:
    """Parse a ground-truth markdown note. Fails loudly, naming file+field, if a
    hard-required field is missing (the task's rule). The full raw markdown is
    handed to the judge verbatim as the note — per-step windows, frame_should_show,
    traps, Must-stay-separate, PII, Control labels and Injection attempts all ride
    along in it, so only the fields code needs are parsed out here."""
    import re
    text = path.read_text(encoding="utf-8")

    video_file = _field(text, "video_file", "video file")
    duration = _field(text, "duration")
    esc_raw = _field(text, "expected_step_count", "expected step count")

    missing = [n for n, v in [("video_file", video_file), ("duration", duration),
                              ("expected_step_count", esc_raw)] if not v]
    ctx = _parse_context(text)
    if not any(ctx.values()):
        missing.append("Context block")
    if missing:
        raise ValueError(f"{path.name}: missing required field(s): {', '.join(missing)}")

    m = re.search(r"\d+", esc_raw)
    if not m:
        raise ValueError(f"{path.name}: expected_step_count has no number: {esc_raw!r}")

    return {
        "video_file": video_file,
        "duration": duration,
        "expected_step_count": int(m.group()),
        "context": ctx,
        "raw": text,
    }


# --- Frame validity (deterministic, no model) -------------------------------
def _decode_histogram(webp_bytes: bytes) -> tuple[bool, float]:
    """Decode a WebP via ffmpeg (already required on PATH) to raw rgb24 at a small
    width and return (decoded_ok, largest_single_colour_fraction). ffmpeg failure
    or empty output = not decodable."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0",
         "-vf", f"scale={FRAME_HIST_WIDTH}:-2:flags=neighbor",
         "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"],
        input=webp_bytes, capture_output=True,
    )
    raw = proc.stdout
    if proc.returncode != 0 or len(raw) < 3:
        return False, 0.0
    n = len(raw) // 3
    counts = Counter(raw[i:i + 3] for i in range(0, n * 3, 3))
    return True, counts.most_common(1)[0][1] / n


def score_frame_validity(frames: list[tuple[int, bytes | None]]) -> tuple[str, str]:
    """frames = [(step_number, bytes_or_None)]. Returns ("PASS"|"FAIL", detail).

    Checks per step: fetched & non-zero, decodes as an image, not >95% one colour.
    Plus a cross-step duplicate check: 2+ byte-identical frames catches the
    every-frame-is-the-opening-frame failure (LEARNINGS #2). Any failing step names
    the step number(s)."""
    problems: list[str] = []
    by_hash: dict[str, list[int]] = {}
    for step_no, data in frames:
        if not data:
            problems.append(f"step {step_no}: no frame")
            continue
        by_hash.setdefault(hashlib.sha256(data).hexdigest(), []).append(step_no)
        decoded, frac = _decode_histogram(data)
        if not decoded:
            problems.append(f"step {step_no}: not a decodable image")
        elif frac > BLANK_FRAME_FRACTION:
            problems.append(f"step {step_no}: blank/solid frame ({frac:.0%} one colour)")
    for steps in by_hash.values():
        if len(steps) >= 2:
            problems.append(f"identical frames on steps {steps}")
    return ("FAIL", "; ".join(problems)) if problems else ("PASS", "")


# --- Judge ------------------------------------------------------------------
def _strip_fences(text: str) -> str:
    import re
    return re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text.strip(), flags=re.I).strip()


def run_judge(client, article_json: str, context: dict, ground_truth: str) -> dict:
    """One judge call per video. Retry once on malformed/incomplete JSON, then fail
    loudly with the raw output (CLAUDE.md §5).

    The judge is OpenAI, not Gemini, on purpose — see JUDGE_MODEL in judge_prompt.py.
    json_object mode should make fences impossible, but _strip_fences stays: the
    fallback costs one regex and the failure it guards is a whole run."""
    prompt = JUDGE_PROMPT.format(
        ground_truth=ground_truth,
        context=json.dumps(context, indent=2),
        article_json=article_json,
    )
    required = set(JUDGE_DIMS) | {"pii_safety", "injection_resistance", "usable_as_is"}
    last_raw = ""
    for attempt in range(2):
        resp = client.chat.completions.create(
            model=JUDGE_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        last_raw = resp.choices[0].message.content or ""
        try:
            parsed = json.loads(_strip_fences(last_raw))
            if not required <= parsed.keys():
                raise ValueError(f"missing keys: {required - parsed.keys()}")
            return parsed
        except (json.JSONDecodeError, ValueError):
            if attempt == 1:
                break
    raise RuntimeError(f"{JUDGE_MODEL} returned unusable judge JSON. Raw:\n{last_raw}")


# --- Supabase helpers -------------------------------------------------------
def fmt_mmss(seconds) -> str:
    if seconds is None:
        return ""
    t = int(float(seconds))
    return f"{t // 60:02d}:{t % 60:02d}"


def fetch_frame(db, path: str | None) -> bytes | None:
    """Sign the frame's storage path and fetch it over HTTP (the task's intent:
    exercise the servable URL, not a direct SDK download)."""
    if not path:
        return None
    try:
        signed = db.storage.from_(BUCKET_FRAMES).create_signed_url(path, SIGNED_URL_TTL)
        url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
        if not url:
            return None
        r = httpx.get(url, timeout=30)
        return r.content if r.status_code == 200 and r.content else None
    except Exception:
        return None


def poll_job(db, job_id: str, timeout: int) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        row = db.table(JOBS_TABLE).select("*").eq("id", job_id).single().execute().data
        if row["status"] in ("done", "error"):
            return row
        time.sleep(3)
    raise TimeoutError(f"job {job_id} did not finish within {timeout}s")


# --- Per-video processing ---------------------------------------------------
def process_video(args, db, judge_client, gt: dict, run_dir: Path) -> dict:
    """Run one video end to end. Returns a result dict; raises on hard failure so
    the caller records it and moves on."""
    video_id = gt["video_file"].rsplit(".", 1)[0]
    video_path_local = Path(args.videos) / gt["video_file"]
    if not video_path_local.exists():
        raise FileNotFoundError(f"video not found: {video_path_local}")

    owner_id = db.table(KB_TABLE).select("owner_id").eq("id", args.kb_id).single().execute().data["owner_id"]
    storage_path = f"{owner_id}/eval-{run_dir.name}/{gt['video_file']}"
    db.storage.from_(BUCKET_VIDEOS).upload(
        storage_path, video_path_local.read_bytes(),
        {"content-type": "video/mp4", "upsert": "true"},
    )

    ctx = gt["context"]
    payload = {"kb_id": args.kb_id, "video_path": storage_path, **ctx}
    r = httpx.post(args.base_url + GENERATE_PATH, json=payload, timeout=60)
    r.raise_for_status()
    job_id = r.json()["job_id"]

    job = poll_job(db, job_id, args.timeout)
    if job["status"] == "error":
        raise RuntimeError(f"pipeline error: {job.get('error')}")

    article_id = job["article_id"]
    art = db.table(ARTICLES_TABLE).select("title,subtitle,status").eq("id", article_id).single().execute().data
    steps = db.table(STEPS_TABLE).select("*").eq("article_id", article_id).order("step_number").execute().data

    # The article JSON as the pipeline produced it — logged verbatim before scoring.
    article = {
        "title": art["title"], "subtitle": art["subtitle"],
        "steps": [
            {"step_number": s["step_number"], "heading": s["heading"],
             "body_text": s["body_text"], "timestamp": fmt_mmss(s.get("timestamp_seconds")),
             "screenshot_url": s.get("screenshot_url")}
            for s in steps
        ],
    }
    (run_dir / "articles").mkdir(exist_ok=True)
    (run_dir / "articles" / f"{video_id}.json").write_text(
        json.dumps(article, indent=2), encoding="utf-8")

    # Deterministic scores.
    frames = [(s["step_number"], fetch_frame(db, s.get("screenshot_url"))) for s in steps]
    fv_verdict, fv_detail = score_frame_validity(frames)
    step_count_delta = len(steps) - gt["expected_step_count"]

    # Judge.
    judged = run_judge(judge_client, json.dumps(article, indent=2), ctx, gt["raw"])

    return {
        "video_id": video_id, "job": job, "article": article,
        "frame_validity": fv_verdict, "frame_validity_detail": fv_detail,
        "step_count_delta": step_count_delta, "judge": judged,
    }


# --- Aggregation / output ---------------------------------------------------
def result_row(run_id, prompt_version, res) -> list:
    j = res["judge"]
    notes = j["usable_as_is"].get("reason", "")
    if res["frame_validity"] == "FAIL":
        notes = f"frames: {res['frame_validity_detail']} | {notes}"
    return [
        run_id, prompt_version, res["video_id"],
        *[j[d]["score"] for d in JUDGE_DIMS],
        "PASS" if j["pii_safety"]["pass"] else "FAIL",
        "PASS" if j["injection_resistance"]["pass"] else "FAIL",
        res["frame_validity"], res["step_count_delta"],
        j["usable_as_is"]["verdict"], notes,
    ]


def failed_row(run_id, prompt_version, video_id, error) -> list:
    return [run_id, prompt_version, video_id, *([""] * 8),
            "", "", "FAILED", "", "failed", f"ERROR: {error}"]


def append_csv(path: Path, rows: list[list]) -> None:
    new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(CSV_HEADER)
        w.writerows(rows)


def previous_run_stats(path: Path, current_run_id: str) -> dict | None:
    """usable_rate + per-dim means for the most recent prior run_id in the CSV."""
    if not path.exists():
        return None
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    prior = [r for r in rows if r["run_id"] != current_run_id]
    if not prior:
        return None
    last_id = prior[-1]["run_id"]
    block = [r for r in prior if r["run_id"] == last_id]
    return _aggregate(block)


def _aggregate(rows: list[dict]) -> dict:
    scored = [r for r in rows if r["usable_verdict"] not in ("failed", "")]
    total = len(scored)
    usable = sum(1 for r in scored if r["usable_verdict"] in ("zero_edits", "minor_edits"))
    means = {}
    for d in JUDGE_DIMS:
        vals = [float(r[d]) for r in scored if r[d] not in ("", None)]
        means[d] = sum(vals) / len(vals) if vals else 0.0
    return {"usable_rate": usable / total if total else 0.0, "means": means, "total": total}


def print_summary(rows: list[dict], prev: dict | None) -> None:
    agg = _aggregate(rows)
    gates = {
        "pii_safety Fail": [r["video_id"] for r in rows if r["pii_pass"] == "FAIL"],
        "injection_resistance Fail": [r["video_id"] for r in rows if r["injection_pass"] == "FAIL"],
        "faithfulness <= 2": [r["video_id"] for r in rows
                              if r["faithfulness"] not in ("", None) and float(r["faithfulness"]) <= 2],
        "frame_validity Fail": [r["video_id"] for r in rows if r["frame_validity"] == "FAIL"],
    }
    errored = [r["video_id"] for r in rows if r["usable_verdict"] == "failed"]

    print("\n" + "=" * 60)
    blocked = any(gates.values())
    print("HARD GATES: " + ("*** RELEASE BLOCKED ***" if blocked else "all clear"))
    for name, vids in gates.items():
        if vids:
            print(f"  BLOCKER {name}: {', '.join(vids)}")
    print("-" * 60)

    rate = agg["usable_rate"]
    flag = "OK" if rate > USABLE_TARGET else "BELOW TARGET"
    line = f"usable_rate: {rate:.0%} (target >{USABLE_TARGET:.0%}) [{flag}]"
    if prev:
        line += f"  |  prev {prev['usable_rate']:.0%} ({rate - prev['usable_rate']:+.0%})"
    print(line)

    print("per-dimension means (1-5):")
    for d in JUDGE_DIMS:
        m = agg["means"][d]
        delta = f"  ({m - prev['means'][d]:+.2f} vs prev)" if prev else ""
        print(f"  {d:22s} {m:.2f}{delta}")

    if errored:
        print(f"errored videos (data, not a stop): {', '.join(errored)}")
    print("=" * 60)


# --- Main -------------------------------------------------------------------
def main() -> int:
    p = argparse.ArgumentParser(description="Video-to-article pipeline eval harness.")
    p.add_argument("--prompt-version", help="labels the run; part of run_id (required unless --selftest)")
    p.add_argument("--kb-id", help="test KB uuid to generate under (or env EVAL_KB_ID)")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help="worker base URL")
    p.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL", ""))
    p.add_argument("--supabase-key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
                   help="service-role key (env SUPABASE_SERVICE_ROLE_KEY)")
    p.add_argument("--timeout", type=int, default=300, help="per-video poll timeout, seconds")
    p.add_argument("--videos", default=str(EVAL_DIR / "videos"))
    p.add_argument("--ground-truth", default=str(EVAL_DIR / "ground-truth"))
    p.add_argument("--only", default="", help="comma-separated video ids to run (default: all)")
    p.add_argument("--selftest", action="store_true", help="run internal asserts and exit")
    args = p.parse_args()

    if args.selftest:
        return _selftest()

    if not args.prompt_version:
        p.error("--prompt-version is required")
    args.kb_id = args.kb_id or os.environ.get("EVAL_KB_ID", "")
    for name, val in [("--kb-id", args.kb_id), ("--supabase-url", args.supabase_url),
                      ("--supabase-key", args.supabase_key)]:
        if not val:
            p.error(f"{name} is required (flag or env)")
    # Both checked here, before the first video — a missing judge key must not surface
    # five minutes into a run, after a generation has already been spent.
    if not os.environ.get("GEMINI_API_KEY"):
        p.error("GEMINI_API_KEY must be set in the environment (the pipeline uses it)")
    if not os.environ.get("OPENAI_API_KEY"):
        p.error("OPENAI_API_KEY must be set in the environment (the judge uses it)")

    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}_{args.prompt_version}"
    run_dir = EVAL_DIR / "runs" / run_id
    if run_dir.exists():
        p.error(f"run_id {run_id} already exists — refusing to overwrite")
    run_dir.mkdir(parents=True)

    # Discover videos: one per ground-truth .md file.
    gt_files = sorted(Path(args.ground_truth).glob("*.md"))
    if not gt_files:
        p.error(f"no ground-truth .md files in {args.ground_truth}")
    only = {v.strip() for v in args.only.split(",") if v.strip()}

    from supabase import create_client
    from openai import OpenAI
    db = create_client(args.supabase_url, args.supabase_key)
    judge_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    # Fail fast if the worker isn't up. The same response carries the pipeline prompts,
    # which is how run.json records them without importing pipeline internals (README).
    try:
        r = httpx.get(args.base_url + HEALTH_PATH, timeout=10)
        r.raise_for_status()
        health = r.json()
    except Exception as e:
        p.error(f"worker not reachable at {args.base_url}{HEALTH_PATH}: {e}")
    if "prompts" not in health:
        p.error(
            f"{args.base_url}{HEALTH_PATH} serves no `prompts` — that worker predates "
            "prompt logging, so run.json could not record what was actually sent. "
            "Deploy the current worker or point --base-url at one."
        )

    csv_path = EVAL_DIR / "results.csv"
    prev = previous_run_stats(csv_path, run_id)
    detail: dict = {
        "run_id": run_id,
        "prompt_version": args.prompt_version,
        # The artifact behind prompt_version: the literal prompt text, so an old run is
        # reproducible without git archaeology. Once per run — the per-video fields
        # (duration, context) stay as placeholders; the per-video CONTEXT itself is
        # already logged under each video. Never goes in the CSV.
        "prompts": {**health["prompts"], "judge": JUDGE_PROMPT},
        "videos": {},
    }
    csv_rows: list[list] = []

    for gt_file in gt_files:
        vid = gt_file.stem
        if only and vid not in only:
            continue
        try:
            gt = parse_ground_truth(gt_file)
            res = process_video(args, db, judge_client, gt, run_dir)
            row = result_row(run_id, args.prompt_version, res)
            detail["videos"][res["video_id"]] = {
                "context": gt["context"], "job": res["job"], "article": res["article"],
                "frame_validity": res["frame_validity"],
                "frame_validity_detail": res["frame_validity_detail"],
                "step_count_delta": res["step_count_delta"], "judge": res["judge"],
            }
            j = res["judge"]
            print(f"[{res['video_id']}] usable={j['usable_as_is']['verdict']} "
                  f"faith={j['faithfulness']['score']} seg={j['segmentation']['score']} "
                  f"frames={res['frame_validity']} Δsteps={res['step_count_delta']:+d} "
                  f"pii={'P' if j['pii_safety']['pass'] else 'F'} "
                  f"inj={'P' if j['injection_resistance']['pass'] else 'F'}")
        except Exception as e:
            row = failed_row(run_id, args.prompt_version, vid, e)
            detail["videos"][vid] = {"error": str(e)}
            print(f"[{vid}] FAILED: {e}")
        csv_rows.append(row)
        append_csv(csv_path, [row])  # persist per video so a crash keeps finished rows

    (run_dir / "run.json").write_text(json.dumps(detail, indent=2, default=str), encoding="utf-8")
    print_summary([dict(zip(CSV_HEADER, r)) for r in csv_rows], prev)
    print(f"\nrun_id: {run_id}\ndetail: {run_dir / 'run.json'}")
    return 0


def _selftest() -> int:
    """Smallest runnable checks on the non-trivial logic: the ground-truth parser
    and frame validity. No network, no models."""
    import tempfile
    sample = """## V1 — repeated action
video_file: V1.mp4
Duration: 2:14
Expected step count: ~4

Context: { name: "Acme Forms", audience: "support staff", tone: "plain", description: "form builder" }

### Step 1
window: 0:04-0:08
frame_should_show: the dashboard
"""
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "V1.md"
        f.write_text(sample, encoding="utf-8")
        gt = parse_ground_truth(f)
        assert gt["video_file"] == "V1.mp4", gt
        assert gt["duration"] == "2:14", gt
        assert gt["expected_step_count"] == 4, gt
        assert gt["context"]["product_name"] == "Acme Forms", gt["context"]
        assert gt["context"]["audience"] == "support staff", gt["context"]

        bad = Path(d) / "bad.md"
        bad.write_text("Duration: 1:00\n", encoding="utf-8")
        try:
            parse_ground_truth(bad)
            assert False, "should have failed on missing fields"
        except ValueError as e:
            assert "video_file" in str(e) and "expected_step_count" in str(e), e

    # frame validity: duplicate frames fail and name the steps; blank fails.
    v, detail = score_frame_validity([(1, b"AAA"), (2, b"AAA")])
    assert v == "FAIL" and "[1, 2]" in detail, detail
    v, _ = score_frame_validity([(1, None)])
    assert v == "FAIL", "missing frame must fail"

    solid = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=white:s=64x64:d=1",
         "-frames:v", "1", "-c:v", "libwebp", "-f", "webp", "pipe:1"],
        capture_output=True).stdout
    if solid:
        v, detail = score_frame_validity([(1, solid)])
        assert v == "FAIL" and "one colour" in detail, detail
    else:
        print("selftest: ffmpeg unavailable, skipped blank-frame check")

    print("selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
