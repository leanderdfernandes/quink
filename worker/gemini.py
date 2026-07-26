"""Gemini calls + JSON robustness.

CLAUDE.md §5: instruct the model to return only valid JSON (no markdown fences); strip
accidental fences before parsing; retry once on malformed JSON, then fail loudly with the
raw output in the error.
"""

import json
import re
import time

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

_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set. See worker/.env.example.")
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


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
