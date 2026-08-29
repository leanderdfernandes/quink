"""Gemini calls + JSON robustness.

CLAUDE.md §5: instruct the model to return only valid JSON (no markdown fences); strip
accidental fences before parsing; retry once on malformed JSON, then fail loudly with the
raw output in the error.
"""

import contextlib
import json
import logging
import re
import time
from pathlib import Path

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

import config
import failures

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)

# finish_reason values that mean "a filter stopped this", not "the model answered badly".
# Without this check a blocked response arrives as empty text, fails to parse, and gets
# misreported as model_bad_output — telling the user to hit retry on something that will
# be blocked every single time.
_BLOCKED_FINISH = {
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "SPII",
    "IMAGE_SAFETY",
    "RECITATION",
}

log = logging.getLogger("quink.gemini")

_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set. See worker/.env.example.")
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _state(file) -> str:
    """The file's state as a bare upper-case name. Enum reprs stringify as
    "FileState.ACTIVE"; take the last segment, same as blocked_reason()."""
    return str(getattr(file, "state", "") or "").rsplit(".", 1)[-1].upper()


@contextlib.contextmanager
def video_part(path: Path, size_bytes: int):
    """The recording, as something Stage 1's `contents` can hold.

    Under INLINE_VIDEO_MAX_BYTES the bytes ride inline — one round trip fewer, and it is
    what every recording we have actually seen does. Over it they MUST NOT: google-genai
    base64-encodes an inline Part and serialises the request through several full copies,
    so a 45MB recording peaked past a 512MB Render instance and the kernel killed the
    worker mid-Stage-1 (2026-08-29). A SIGKILL runs no `except`, so the job row stayed at
    'running' with no failure code — the stuck spinner, arrived at from the one direction
    the taxonomy cannot classify. `files.upload` streams from disk and holds none of it.

    Reads the file lazily in the inline branch so the caller can drop its own copy of the
    bytes before we make ours.
    """
    if size_bytes <= config.INLINE_VIDEO_MAX_BYTES:
        yield types.Part.from_bytes(data=path.read_bytes(), mime_type="video/mp4")
        return

    log.info("video is %.1fMB — uploading via the File API", size_bytes / 1e6)
    try:
        file = client().files.upload(file=str(path), config={"mime_type": "video/mp4"})
    except Exception as e:
        # Same class as a dropped Stage 1 transport: ours, not their recording.
        raise failures.Failed(
            failures.MODEL_UNAVAILABLE, f"File API upload failed: {e}"
        ) from e

    try:
        deadline = time.monotonic() + config.FILE_API_ACTIVE_TIMEOUT_SECONDS
        while _state(file) == "PROCESSING":
            if time.monotonic() > deadline:
                raise failures.Failed(
                    failures.MODEL_UNAVAILABLE,
                    f"File API still PROCESSING {file.name} after "
                    f"{config.FILE_API_ACTIVE_TIMEOUT_SECONDS}s.",
                )
            time.sleep(config.FILE_API_POLL_SECONDS)
            file = client().files.get(name=file.name)
        if _state(file) != "ACTIVE":
            # Gemini could not decode the container. That IS about their file, and it is
            # the same thing ffprobe would have said if it had been the one to choke.
            raise failures.Failed(
                failures.VIDEO_UNREADABLE,
                f"File API could not process the recording (state {_state(file)}).",
            )
        yield file
    finally:
        # Uploaded files expire on their own in 48h, so this is tidiness against the
        # per-project storage quota, never correctness. It must not be able to turn a
        # finished Stage 1 into a failure.
        with contextlib.suppress(Exception):
            client().files.delete(name=file.name)


def strip_fences(text: str) -> str:
    """The prompt says no fences, but models add them anyway. Belt and braces."""
    out = _FENCE.sub("", text.strip())
    return out.strip()


def _call_with_transport_retry(model: str, contents: list):
    """One generate_content call, retrying transient transport failures.

    Stage 1 pushes the whole video inline (tens of MB) and the job runs ~90s, so a
    dropped connection is a normal event, not an exception — observed in testing as
    WinError 10054 / StreamReset mid-call. A transport blip must not discard the run.

    This IS the silent server-side auto-retry the taxonomy promises for
    `model_unavailable`: 429 and 5xx are retried here, with backoff, and the user never
    sees a screen that then vanishes on its own. Only if the retries are exhausted does a
    model_unavailable failure reach them.

    Deliberately does NOT retry a non-429 ClientError: a bad key or a dead model id is a
    mistake, and repeating it just burns time.
    """
    for attempt in range(config.GEMINI_TRANSPORT_RETRY_ATTEMPTS):
        try:
            return client().models.generate_content(
                model=model,
                contents=contents,
                # Ask the API itself for JSON rather than relying on the prompt alone.
                # This does not change the prompt's semantics; the fence-stripping and
                # JSON retry stay as defence.
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
        except genai_errors.ClientError as e:
            # 429 is "busy", not "wrong" — it belongs with the 5xx retries, not with the
            # dead-model-id class. Everything else 4xx surfaces immediately.
            if getattr(e, "code", None) != 429:
                raise
            if attempt == config.GEMINI_TRANSPORT_RETRY_ATTEMPTS - 1:
                raise
            time.sleep(config.GEMINI_TRANSPORT_BACKOFF_SECONDS * (attempt + 1))
        except Exception:
            if attempt == config.GEMINI_TRANSPORT_RETRY_ATTEMPTS - 1:
                raise
            time.sleep(config.GEMINI_TRANSPORT_BACKOFF_SECONDS * (attempt + 1))
    raise RuntimeError("unreachable")


def blocked_reason(response) -> str | None:
    """The detail string if a filter stopped this response, else None.

    Checked before parsing: a blocked response has empty text, so without this it would be
    indistinguishable from malformed JSON — and `model_bad_output` offers a retry button
    that cannot possibly succeed against a safety filter.
    """
    feedback = getattr(response, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        return f"prompt blocked: {feedback.block_reason}"
    for candidate in getattr(response, "candidates", None) or []:
        reason = str(getattr(candidate, "finish_reason", "") or "")
        # Enum reprs stringify as "FinishReason.SAFETY"; take the last segment.
        if reason and reason.rsplit(".", 1)[-1].upper() in _BLOCKED_FINISH:
            return f"finish_reason: {reason}"
    return None


class MalformedModelJSON(failures.Failed):
    """Raised after the retry is exhausted. Carries the raw output — failing loudly
    with the model's actual response is the whole point (CLAUDE.md §5). It is a Failed,
    so the raw output rides in `detail`, which the client never sees."""

    def __init__(self, model: str, raw: str, detail: str):
        self.model = model
        self.raw = raw
        super().__init__(
            failures.MODEL_BAD_OUTPUT,
            f"{model} returned unparseable JSON ({detail}). Raw output:\n{raw}",
        )


def generate_json[T: BaseModel](
    *,
    model: str,
    contents: list,
    schema: type[T],
) -> T:
    """Call a model, parse JSON, validate against `schema`. One retry, then fail loudly.

    Every exit is a classified `failures.Failed` — this is one of the two places in the
    codebase that knows WHY a model call went wrong, so it is the only place that can
    honestly say so.
    """
    last_raw = ""
    last_detail = ""

    for attempt in range(config.JSON_RETRY_ATTEMPTS):
        try:
            response = _call_with_transport_retry(model, contents)
        except genai_errors.ClientError as e:
            # 429 only reaches here with the retries exhausted — that is genuinely "busy".
            # Any other 4xx is ours (bad key, dead model id, payload too large): retrying
            # repeats the mistake, so it surfaces immediately. This is the class
            # LEARNINGS #1's dead model lands in.
            code = (
                failures.MODEL_UNAVAILABLE
                if getattr(e, "code", None) == 429
                else failures.MODEL_BAD_OUTPUT
            )
            raise failures.Failed(code, f"{model} rejected the call: {e}") from e
        except genai_errors.ServerError as e:
            raise failures.Failed(
                failures.MODEL_UNAVAILABLE, f"{model} 5xx after retries: {e}"
            ) from e
        except Exception as e:
            # Transport died and the retries above didn't rescue it. Their file is fine.
            raise failures.Failed(
                failures.MODEL_UNAVAILABLE, f"{model} call failed: {e}"
            ) from e

        # Before parsing: an empty body from a filter is not malformed JSON, and telling
        # the user to retry it would be a button that can never work.
        blocked = blocked_reason(response)
        if blocked:
            raise failures.Failed(failures.MODEL_BLOCKED, f"{model} {blocked}")

        raw = response.text or ""
        last_raw = raw
        try:
            return schema.model_validate(json.loads(strip_fences(raw)))
        except (json.JSONDecodeError, ValidationError) as e:
            last_detail = str(e)
            if attempt == config.JSON_RETRY_ATTEMPTS - 1:
                break
            # Retry once. The prompt is unchanged; models are non-deterministic and a
            # second draw usually parses.

    raise MalformedModelJSON(model, last_raw, last_detail)


def demo() -> None:
    """Self-check for the branch that decides how the recording travels: `python gemini.py`.

    The whole point of video_part is that a big recording never becomes an inline Part —
    that is what killed the worker. So the check is: which branch, and does the uploaded
    file get released afterwards. No network; a fake files service records the calls.
    """
    import tempfile

    global _client

    class _File:
        def __init__(self, states):
            self.name = "files/abc"
            self._states = list(states)
            self.state = self._states.pop(0)

        def advance(self):
            if self._states:
                self.state = self._states.pop(0)
            return self

    class _Files:
        def __init__(self, states):
            self.file = _File(states)
            self.uploaded = self.deleted = False

        def upload(self, *, file, config=None):
            self.uploaded = True
            return self.file

        def get(self, *, name):
            return self.file.advance()

        def delete(self, *, name):
            self.deleted = True

    class _Client:
        def __init__(self, states):
            self.files = _Files(states)

    saved, real_poll = _client, config.FILE_API_POLL_SECONDS
    config.FILE_API_POLL_SECONDS = 0.0
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source.mp4"
            path.write_bytes(b"x" * 1024)

            # Small: inline, and the File API is never touched.
            _client = _Client(["ACTIVE"])
            with video_part(path, 1024) as part:
                assert isinstance(part, types.Part), type(part)
                assert part.inline_data is not None
            assert not _client.files.uploaded, "small video must not hit the File API"

            # Big: uploaded, waited out of PROCESSING, and released on the way out.
            _client = _Client(["PROCESSING", "FileState.ACTIVE"])
            with video_part(path, config.INLINE_VIDEO_MAX_BYTES + 1) as part:
                assert part is _client.files.file, "big video must yield the uploaded file"
                assert not _client.files.deleted, "released too early"
            assert _client.files.uploaded and _client.files.deleted

            # Gemini could not decode it: their file, and still released.
            _client = _Client(["FileState.FAILED"])
            try:
                with video_part(path, config.INLINE_VIDEO_MAX_BYTES + 1):
                    raise AssertionError("FAILED state must not yield")
            except failures.Failed as e:
                assert e.code == failures.VIDEO_UNREADABLE, e.code
            assert _client.files.deleted, "must release the file even on failure"
    finally:
        _client, config.FILE_API_POLL_SECONDS = saved, real_poll

    print("gemini video_part OK")


if __name__ == "__main__":
    demo()
