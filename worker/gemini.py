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

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)

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

    Deliberately does NOT retry ClientError (4xx): a bad key or a dead model id is a
    mistake, and repeating it just burns time. Only 5xx and transport errors retry.
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
        except genai_errors.ClientError:
            raise
        except Exception:
            if attempt == config.GEMINI_TRANSPORT_RETRY_ATTEMPTS - 1:
                raise
            time.sleep(config.GEMINI_TRANSPORT_BACKOFF_SECONDS * (attempt + 1))
    raise RuntimeError("unreachable")


class MalformedModelJSON(RuntimeError):
    """Raised after the retry is exhausted. Carries the raw output — failing loudly
    with the model's actual response is the whole point (CLAUDE.md §5)."""

    def __init__(self, model: str, raw: str, detail: str):
        self.model = model
        self.raw = raw
        super().__init__(f"{model} returned unparseable JSON ({detail}). Raw output:\n{raw}")


def generate_json[T: BaseModel](
    *,
    model: str,
    contents: list,
    schema: type[T],
) -> T:
    """Call a model, parse JSON, validate against `schema`. One retry, then fail loudly."""
    last_raw = ""
    last_detail = ""

    for attempt in range(config.JSON_RETRY_ATTEMPTS):
        try:
            response = _call_with_transport_retry(model, contents)
        except genai_errors.ClientError as e:
            # 4xx — our fault (bad key, bad model id, payload too large). Retrying just
            # repeats the mistake; fail loudly. This is the class LEARNINGS #1's dead
            # model lands in, and it should surface immediately, not after a backoff.
            raise RuntimeError(f"{model} rejected the call: {e}") from e
        except Exception as e:
            raise RuntimeError(f"{model} call failed: {e}") from e

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
