"""The JSON contract (CLAUDE.md §6).

Mirrored by web/src/lib/types.ts and the public.steps table. If the three drift,
that's a bug.
"""

import re

from pydantic import BaseModel, Field, field_validator

MMSS = re.compile(r"^\d{1,3}:[0-5]\d$")


class BlueprintStep(BaseModel):
    """Stage 1 / Stage 2 model-facing shape.

    The model-facing field is `timestamp` (an "MM:SS" string); the internal
    representation is `timestamp_seconds`. The final JSON contract carries neither —
    it carries screenshot_url. (LEARNINGS #2, field-name note.)
    """

    step_number: int
    heading: str
    body_text: str
    timestamp: str

    @field_validator("timestamp")
    @classmethod
    def check_mmss(cls, v: str) -> str:
        # Reject floats and bare seconds loudly. A float here is the LEARNINGS #2 bug
        # returning: every screenshot silently becomes the opening frame. Better to
        # fail the parse and retry than to ship an article of identical screenshots.
        v = v.strip()
        if not MMSS.match(v):
            raise ValueError(f"timestamp must be an 'MM:SS' string, got {v!r}")
        return v


class Blueprint(BaseModel):
    title: str
    subtitle: str
    steps: list[BlueprintStep]


class Step(BaseModel):
    """A step as the product stores and serves it."""

    step_number: int
    heading: str
    body_text: str
    screenshot_url: str | None = None


class Article(BaseModel):
    title: str
    subtitle: str
    steps: list[Step]


class GenerateRequest(BaseModel):
    kb_id: str
    video_path: str = Field(description="Storage path in the videos bucket")
    product_name: str
    audience: str = ""
    tone: str = ""
    description: str = ""

    def context(self) -> dict:
        return {
            "product_name": self.product_name,
            "audience": self.audience,
            "tone": self.tone,
            "description": self.description,
        }


class GenerateResponse(BaseModel):
    job_id: str


class RetryRequest(BaseModel):
    """Re-run a failed job from the recording already in Storage. No file, deliberately:
    a retry that asks for the video again is not a retry."""

    job_id: str


# --- Custom domain (build spec §4) ------------------------------------------
class DomainConnectRequest(BaseModel):
    kb_id: str
    domain: str


class DomainKbRequest(BaseModel):
    kb_id: str


class DomainStubRequest(BaseModel):
    """Dev-only: drive the stub verifier so a domain 'resolves' on the next check."""

    domain: str
    resolves: bool = True


def parse_mmss(value: str) -> float:
    """'01:37' -> 97.0. The backend parses MM:SS -> seconds (LEARNINGS #2)."""
    minutes, seconds = value.strip().split(":")
    return int(minutes) * 60 + int(seconds)


def format_mmss(seconds: float) -> str:
    total = int(seconds)
    return f"{total // 60:02d}:{total % 60:02d}"
