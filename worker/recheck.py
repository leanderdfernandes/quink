"""Check the recording — the one edit a general chat model cannot make.

PRD "Context & AI Editing" §6.3. Re-read the source video around ONE step and propose a
correction, carrying the two lines nothing else can produce: the timestamp range, and what
was actually observed there.

WHY THE VERBS ARE `Keep` AND `Discard` AND NOT `Try again` (§6.2): a factual correction is
not a matter of taste. Rerolling it would be asking the same question of the same seconds
and hoping for a different answer, which is a slot machine wearing a diff card.

THE FAILURE TO DESIGN AGAINST is not a clumsy sentence — the user reviews sentences. It is a
FABRICATED "observed in your recording" claim, because that line carries our authority and
the user will tap Keep. Everything below exists for that:

  * the model is given the CLIP, not the article's own words dressed up as evidence;
  * `observed` is required, non-empty and capped, and a response without it is rejected;
  * the response is validated against a schema and REJECTED, never repaired;
  * `no_change` is a first-class answer, so "it already matches" does not have to be
    expressed as a rewrite.
"""

import logging
import tempfile
import threading
import time
from pathlib import Path

from google.genai import types
from pydantic import BaseModel, Field, field_validator

import config
import failures
import frames as frames_mod
import gemini
import prompts
from models import format_mmss

log = logging.getLogger("quink.recheck")


class Recheck(BaseModel):
    """What the model is allowed to answer with. Nothing else parses."""

    # True when the step already says what the recording shows. A separate field rather than
    # an empty proposal: without it, "no change needed" can only be expressed as a rewrite,
    # and the model will produce a cosmetic one to fill the space.
    no_change: bool = False
    proposed_text: str = ""
    # WHAT WAS ON SCREEN. Required whichever way no_change lands, because it is the whole
    # value of this feature — the user is being asked to trust a claim about their own
    # recording, and a claim with no observation behind it is the thing this must never ship.
    observed: str = Field(min_length=1)

    @field_validator("observed", "proposed_text")
    @classmethod
    def _cap(cls, v: str) -> str:
        v = " ".join((v or "").split())
        if len(v) > 600:
            raise ValueError("over 600 characters")
        return v


# ponytail: in-process, per instance, resets on deploy — same limitation lanes.py records
# for itself. Upgrade path is the same one: a row in the database keyed on article id.
_hits: dict[str, list[float]] = {}
_hits_guard = threading.Lock()


def _rate_limited(article_id: str) -> bool:
    """True when this article has had too many re-reads in the last hour.

    Invisible at normal usage and never surfaced as a counter (PRD §8: one meter in this
    product, and retention is already it). Nobody re-reads the same step twelve times in an
    hour on purpose, so this only ever catches a loop.
    """
    now = time.monotonic()
    with _hits_guard:
        recent = [t for t in _hits.get(article_id, []) if now - t < 3600]
        if len(recent) >= config.RECHECK_MAX_PER_ARTICLE_PER_HOUR:
            _hits[article_id] = recent
            return True
        recent.append(now)
        _hits[article_id] = recent
        return False


def run(
    *,
    article_id: str,
    kb_id: str,
    video_path: str,
    step_number: int,
    heading: str,
    body_text: str,
    timestamp_seconds: float,
    download,
) -> dict:
    """Re-read the recording around one step. Returns the §6.3 response shape.

    `download` is injected rather than imported so the self-check can run this whole
    function with no network and no Storage.
    """
    if _rate_limited(article_id):
        # Not a failure screen and not a counter: the caller turns this into a quiet
        # "try that again in a minute". Saying more would be inventing a meter.
        raise failures.Failed(
            failures.RECHECK_BUSY,
            f"article {article_id} is over RECHECK_MAX_PER_ARTICLE_PER_HOUR",
        )

    start = max(timestamp_seconds - config.RECHECK_WINDOW_SECONDS, 0.0)
    end = timestamp_seconds + config.RECHECK_WINDOW_SECONDS
    # The range REPORTED is the range we asked for, not what ffmpeg's keyframe cut produced.
    # It is what the user checks against their own recording, so it has to be the window the
    # question was about.
    window = {"from": format_mmss(start), "to": format_mmss(end)}

    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / "source.mp4"
        local.write_bytes(download(video_path))
        clip = frames_mod.extract_clip(local, start, end, Path(tmp) / "clip.mp4")
        answer = gemini.generate_json(
            model=config.VIDEO_MODEL,
            contents=[
                types.Part.from_bytes(data=clip.read_bytes(), mime_type="video/mp4"),
                prompts.build_recheck_prompt(
                    window_from=window["from"],
                    window_to=window["to"],
                    heading=heading,
                    body_text=body_text,
                ),
            ],
            schema=Recheck,
        )

    log.info(
        "recheck: kb=%s article=%s step=%s window=%s-%s no_change=%s",
        kb_id, article_id, step_number, window["from"], window["to"], answer.no_change,
    )
    return {
        "no_change": answer.no_change or not answer.proposed_text,
        "proposed_text": answer.proposed_text,
        "observed": answer.observed,
        "window": window,
    }


def demo() -> None:
    """`python recheck.py`. No network: a fake model and a fake download.

    What is worth asserting is the boundary, not the prose — that a response missing the
    observation is REJECTED rather than shipped without it, and that the window reported is
    the window asked for rather than whatever the clip cut turned out to be.
    """
    import json

    calls: list[str] = []

    class _Resp:
        def __init__(self, payload):
            self.text = json.dumps(payload)
            self.candidates = []
            self.prompt_feedback = None

    payload = {
        "no_change": False,
        "proposed_text": "Click Save and publish. It stays greyed out until an address is in the field.",
        "observed": "The button read “Save and publish” and was disabled until the address field had text.",
    }

    def fake_call(model, contents):
        calls.append(model)
        return _Resp(payload)

    gemini._call_with_transport_retry = fake_call
    frames_mod.extract_clip = lambda _v, _s, _e, out: (out.write_bytes(b"clip"), out)[1]

    out = run(
        article_id="a1", kb_id="kb1", video_path="kb1/v.mp4", step_number=3,
        heading="Save the page", body_text="<p>Press the button.</p>",
        timestamp_seconds=95.0, download=lambda _p: b"video",
    )
    assert calls == [config.VIDEO_MODEL], calls
    assert out["window"] == {"from": "01:29", "to": "01:41"}, out["window"]
    assert out["observed"].startswith("The button read"), out
    assert out["no_change"] is False

    # An answer with no observation is REJECTED. This is the fabricated-evidence guard: a
    # correction with nothing behind it must never reach a diff card the user will accept.
    payload = {"proposed_text": "Click the blue button.", "observed": ""}
    try:
        run(article_id="a2", kb_id="kb1", video_path="kb1/v.mp4", step_number=1,
            heading="h", body_text="b", timestamp_seconds=10.0, download=lambda _p: b"v")
        raise AssertionError("a response with no observation must not be accepted")
    except failures.Failed as e:
        assert e.code == failures.MODEL_BAD_OUTPUT, e.code

    # "It already matches" is a first-class answer, not a cosmetic rewrite.
    payload = {"no_change": True, "proposed_text": "", "observed": "The step already matches."}
    out = run(article_id="a3", kb_id="kb1", video_path="kb1/v.mp4", step_number=1,
              heading="h", body_text="b", timestamp_seconds=10.0, download=lambda _p: b"v")
    assert out["no_change"] is True and out["proposed_text"] == ""

    # The rate limit is per ARTICLE and it actually bites.
    _hits.clear()
    payload = {"no_change": True, "proposed_text": "", "observed": "ok"}
    for _ in range(config.RECHECK_MAX_PER_ARTICLE_PER_HOUR):
        run(article_id="a4", kb_id="kb1", video_path="kb1/v.mp4", step_number=1,
            heading="h", body_text="b", timestamp_seconds=10.0, download=lambda _p: b"v")
    try:
        run(article_id="a4", kb_id="kb1", video_path="kb1/v.mp4", step_number=1,
            heading="h", body_text="b", timestamp_seconds=10.0, download=lambda _p: b"v")
        raise AssertionError("the rate limit must bite")
    except failures.Failed as e:
        assert e.code == failures.RECHECK_BUSY, e.code
    # ...and only for that article.
    run(article_id="a5", kb_id="kb1", video_path="kb1/v.mp4", step_number=1,
        heading="h", body_text="b", timestamp_seconds=10.0, download=lambda _p: b"v")

    print("recheck self-check OK")


if __name__ == "__main__":
    demo()
