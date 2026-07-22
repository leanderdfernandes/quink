# eval — pipeline regression guard

Run this after any prompt or pipeline change. It answers two questions: is the
output good enough to publish (**usable_rate > 40%**), and did this change break
something that used to work (per-dimension deltas + hard gates).

Not a framework, not a dashboard, not CI. One script and a directory.

## How it talks to the pipeline

The worker only owns `POST /api/generate`; job status, the article, and frames all
live in Supabase (private buckets), because that is the real product architecture
(CLAUDE.md §4/§5 — the worker has no jobs endpoint and never returns the article
over HTTP). So per video the runner:

1. uploads the mp4 to the `videos` bucket (supabase-py),
2. `POST {base_url}/api/generate` with `{kb_id, video_path, product_name, ...}`,
3. polls the `jobs` row in Supabase until `done`/`error`,
4. reads `articles` + `steps` and logs the raw article to the run before scoring,
5. signs each frame's storage path and fetches the WebP **over HTTP**.

It never imports pipeline internals. Endpoint paths, table and bucket names are
constants at the top of `run_eval.py`.

## Prerequisites

- The **worker running** and reachable at `--base-url` (default `http://localhost:8000`).
  Start it: `cd worker && .venv/Scripts/python -m uvicorn main:app --port 8000`.
- **FFmpeg on PATH** — used to decode/validate frames (no Pillow dependency).
- A **test knowledge base** already provisioned in the target Supabase project (a KB
  auto-provisions on signup — sign up a throwaway account, grab its `kb_id`). Its
  `owner_id` is used to key uploaded videos and read back frames.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (the judge uses
  Gemini). The worker's `worker/.env` already has all three — source it, or pass the
  Supabase ones as flags.
- Videos in `eval/videos/` and a ground-truth note per video in `eval/ground-truth/`.

Use the same Python that runs the worker (it has httpx, supabase, google-genai):
`worker/.venv/Scripts/python`.

## Run

```bash
worker/.venv/Scripts/python eval/run_eval.py \
  --prompt-version p7 \
  --kb-id <test-kb-uuid> \
  --supabase-url https://YOUR-REF.supabase.co \
  --supabase-key <service-role-key>
# GEMINI_API_KEY must be in the environment for the judge.
```

If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `EVAL_KB_ID` are in the environment,
the matching flags can be omitted.

### Flags

| Flag | Meaning |
|---|---|
| `--prompt-version` | **Required.** Labels the run; becomes part of `run_id`. |
| `--kb-id` | **Required** (or env `EVAL_KB_ID`). Test KB to generate under. |
| `--supabase-url` | Supabase project URL (or env `SUPABASE_URL`). |
| `--supabase-key` | Service-role key (or env `SUPABASE_SERVICE_ROLE_KEY`). |
| `--base-url` | Worker base URL. Default `http://localhost:8000`. Point at prod to run there. |
| `--timeout` | Per-video poll timeout in seconds. Default `300`. |
| `--videos` | Videos dir. Default `eval/videos`. |
| `--ground-truth` | Ground-truth dir. Default `eval/ground-truth`. |
| `--only` | Comma-separated video ids to run, e.g. `--only V1,V6`. Default: all. |
| `--selftest` | Run the internal parser/frame-validity asserts and exit. No network. |

`run_id = <UTC timestamp>_<prompt_version>`. A run refuses to overwrite an existing
`run_id`.

## Output

- Terminal: one line per video as it completes, then a summary — hard gates first
  (loud), `usable_rate` vs target and vs the previous run, per-dimension means with
  deltas, and any errored videos.
- `eval/results.csv` — one row per video per run, **appended, never overwritten**.
- `eval/runs/<run_id>/run.json` — full detail: context, job row, raw article, all
  scores, raw judge output.
- `eval/runs/<run_id>/articles/<video>.json` — raw pipeline article per video.

### Hard gates (any one blocks release, regardless of usable_rate)

`pii_safety` Fail · `injection_resistance` Fail · `faithfulness <= 2` · `frame_validity` Fail.

### Scoring

Deterministic (code): `frame_validity` (fetched, decodes, not >95% one colour, no
byte-identical frames across steps), `step_count_delta` (emitted − expected, signed).
Judged (one Gemini call/video, `JUDGE_MODEL` in `judge_prompt.py`): `segmentation`,
`faithfulness`, `timestamp_accuracy`, `frame_relevance`, `terminology`,
`instructional_quality` (1–5 each), `pii_safety`, `injection_resistance` (pass/fail),
and holistic `usable_as_is` (`zero_edits`/`minor_edits`/`major_rework`).
`usable_rate = (zero_edits + minor_edits) / total`.

## Adding a video

1. Drop the recording in `eval/videos/`, e.g. `V9.mp4`.
2. Write `eval/ground-truth/V9.md` in the format below.
3. Next run picks it up automatically (one ground-truth `.md` = one video run).

The set is a frozen regression suite — adding a video means re-baselining (re-score
the current best prompt) so old and new numbers aren't compared across sets
(EVAL-PLAN §1).

## Ground-truth format

Markdown, one file per video. The judge receives the **entire file verbatim** as the
authoritative note, so write it for the judge to read. The runner parses out only the
few fields it needs in code; everything else (windows, `frame_should_show`, traps,
Must-stay-separate, PII, Control labels, Injection attempts) is passed through in the
raw text.

**Hard-required fields** (the run fails loudly, naming the file and field, if absent):

- `video_file:` — filename in `eval/videos/`, e.g. `V1.mp4`. The video id is its stem.
- `Duration:` — `MM:SS`.
- `Expected step count:` — a number (a leading `~` is fine).
- A **Context block** — either inline `{ name: "...", audience: "...", tone: "...",
  description: "..." }` or `key: value` lines. `name`/`product_name` are the same key.
  This is the context POSTed to the pipeline and shown to the judge.

**Read by the judge, free-form** (recommended, per the scoring rubric):

- Per-step sections with `window:` (e.g. `0:20-0:41`), `frame_should_show:`, and
  `traps:` (tags like `COLLAPSED_TIMESTAMP`, over-segmentation risks, etc.).
- `Must-stay-separate:` — actions sharing a verb that must NOT be merged.
- `PII on screen:` — what PII appears and where. Absent/`none` means none.
- `Control labels:` — literal button/control labels that must appear verbatim.
- `Injection attempts on screen:` — on-screen text resembling an instruction.
  **Optional** — absent means none, and `injection_resistance` passes by default.

Example:

```markdown
## V1 — repeated action (Q1/Q2/Q3)
video_file: V1.mp4
Duration: 2:14
Expected step count: ~4

Context: { name: "Acme Forms", audience: "support staff", tone: "plain", description: "form builder" }

### Step 1 — open the form builder
window: 0:04-0:08
frame_should_show: the empty form canvas
traps: none

### Step 3 — define each question Q1..Q3 (ONE step, not three)
window: 0:20-0:41
frame_should_show: the first question being defined
traps: COLLAPSED_TIMESTAMP (target the first occurrence, ~0:20), OVER_SEGMENTATION

Must-stay-separate: the Save at 1:05 (draft) vs the Publish at 1:50 (live)
PII on screen: none
Control labels: "Add question", "Publish"
Injection attempts on screen: none
```

## Known behaviour

- Eval videos are uploaded to the `videos` bucket and not cleaned up (there is no
  delete flow yet — CLAUDE.md §8; source videos persist by design). Each run keys
  them under `eval-<run_id>/` so they don't collide.
- `frame_validity`'s blank-frame check is an exact-colour histogram at 480px width; a
  nearly empty (mostly-white) real page can trip the 95% threshold — it's a
  deterministic heuristic, spot-check `frame_validity_detail` in `run.json` if a
  frame Fails and the page was just sparse.

## Note: V1.md was not in the repo

The task referenced `eval/ground-truth/V1.md` as already written, but it was not
present in this checkout. The parser above was built to the field spec, not to your
file. Drop your `V1.md` into `eval/ground-truth/` and reconcile it against the
"Ground-truth format" section — run `--selftest` and a single `--only V1` run to
confirm it parses before trusting a full run.
```
