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
    # Stage 1's clarification questions (PRD §5), RAW. Deliberately typed as loose dicts
    # rather than a strict model, and this is not laziness — it is the degrade rule (§10g)
    # applied to the newest thing in the pipeline.
    #
    # A strict schema here would fail the whole parse over one malformed question, costing
    # the user the ARTICLE to protect them from a QUESTION. worker/clarify.py validates each
    # one against the closed enum and drops the ones that fail, which is the behaviour PRD
    # §5 actually asks for ("Anything else → drop the clarification, do not repair it").
    #
    # Nothing reads this field directly. Everything goes through clarify.validate().
    clarifications: list[dict] = Field(default_factory=list)


class Step(BaseModel):
    """A step as the product stores and serves it.

    The JSON contract (CLAUDE.md §6), mirrored by web/src/lib/types.ts and public.steps.
    The pipeline itself writes Blueprint rows, not these — this is the shape of the finished
    article, and it is kept in step with the other two so §6 stays true.
    """

    step_number: int
    heading: str
    body_text: str
    screenshot_url: str | None = None
    # Non-destructive SVG overlay in normalized 0-1 coordinates (migration 0029). The
    # pipeline never writes any: generated steps start bare and the column defaults to [].
    annotations: list[dict] = Field(default_factory=list)


class Article(BaseModel):
    title: str
    subtitle: str
    steps: list[Step]


class ProductContext(BaseModel):
    """What the help center documents. Reused by every run in a KB — it is stored on
    knowledge_bases (migration 0027) and sent per request so the JOB keeps a copy of what
    it was actually grounded on. Re-reading the KB at retry time would re-ground the retry
    on whatever the product context says LATER, which is not the same article."""

    product_name: str
    description: str = ""
    audience: str = ""
    tone: str = ""


class GenerateRequest(BaseModel):
    kb_id: str
    video_path: str = Field(description="Storage path in the videos bucket")
    product: ProductContext
    # What THIS recording shows. Optional, per file, never stored on the KB.
    recording: str = ""

    def context(self) -> dict:
        return {"product": self.product.model_dump(), "recording": self.recording}


class GenerateResponse(BaseModel):
    job_id: str


class RecheckRequest(BaseModel):
    """Re-read the source recording around one step (PRD §6.3).

    Addressed by `step_number`, not by a step row id: the id is not in the §6 contract and
    the step's POSITION is what the user pointed at. Ownership is proved through the
    article's KB, so neither field is a capability.
    """

    article_id: str
    step_number: int


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


class InviteEmailRequest(BaseModel):
    """Send (or re-send) the invite mail for one live invite.

    Keyed on the ADDRESS, not the token: there is one live invite per address per KB, so
    the worker resolves the token itself and the capability never travels through the
    inviter's browser. The same request is both the first send and Resend.
    """

    kb_id: str
    email: str


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


def canonical_body(text: str) -> str:
    """Turn a model's plain prose into the HTML the editor and the reader both expect.

    `steps.body_text` is rendered by TipTap in the editor and by DOMPurify on the reader --
    both of them HTML. The model returns "one or two sentences" of plain text, and this used
    to be stored exactly as returned. TipTap then parsed it into a paragraph the moment the
    editor mounted, so the same step read as bare prose in the database and as `<p>...</p>`
    in the editor.

    That gap was visible to customers as a lie: the article list compared the raw rows and
    reported "4 unpublished edits" on an article nobody had touched, while the editor -- which
    compared TipTap's normalised copy -- reported it clean. Opening the article silently
    rewrote the rows and the phantom count changed. Writing the canonical form HERE is the fix
    at the source; `canonicalBody` in web/src/lib/pendingEdits.ts is its mirror, and exists to
    settle rows written before this function did.

    Escapes before wrapping, because this is prose being turned into markup: an ampersand or
    a less-than in a heading is text, not the start of a tag. TipTap escapes the same three.
    Text that is ALREADY markup is passed through untouched.
    """
    s = (text or "").strip()
    if not s:
        return ""
    if s.startswith("<"):
        return s
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Blank lines separate paragraphs, which is what TipTap does with pasted prose. Single
    # newlines are joined -- a wrapped sentence is one sentence.
    paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", s)]
    return "".join(f"<p>{p}</p>" for p in paras if p)
