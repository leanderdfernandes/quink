"""The JSON contract (CLAUDE.md §6).

Mirrored by web/src/lib/types.ts and the public.steps table. If the three drift,
that's a bug.
"""

import re

from pydantic import AliasChoices, BaseModel, Field, field_validator

MMSS = re.compile(r"^\d{1,3}:[0-5]\d$")
# The ONLY two pieces of formatting generation may produce, applied in canonical_body().
# The lookarounds keep them off a lone " * " in prose; the [^*] class stops a run of
# asterisks pairing across a paragraph break and swallowing everything between.
_BOLD = re.compile(r"\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*")
_ITALIC = re.compile(r"(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)")
# What counts as "already markup" for the pass-through in canonical_body(). Deliberately a
# closed list of the block tags we emit, not "starts with a <".
_BLOCK_START = re.compile(r"<(p|ul|ol|li|h[1-6]|blockquote|pre)[\s>]", re.I)


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


class ProductNote(BaseModel):
    """One {title, body} block of product context. Repeatable so a glossary, a feature list
    and a roles breakdown are not forced into one paragraph."""

    id: str = ""
    title: str = ""
    body: str = ""


class ProductContext(BaseModel):
    """What the help center documents. Reused by every run in a KB — it is stored on
    knowledge_bases.product_context (migration 0044) and sent per request so the JOB keeps a
    copy of what it was actually grounded on. Re-reading the KB at retry time would re-ground
    the retry on whatever the product context says LATER, which is not the same article.

    `name` was `product_name` before the fold, and `audience`/`tone` were cut by PRD §4.
    Both old names are still ACCEPTED here, and deliberately: a retry replays jobs.context
    from a row written before 0044, and that row carries the old keys. Dropping them would
    turn every historical job into a 422 at the moment someone pressed Retry.
    """

    model_config = {"populate_by_name": True}

    name: str = Field(default="", validation_alias=AliasChoices("name", "product_name"))
    description: str = ""
    notes: list[ProductNote] = Field(default_factory=list)
    # Pre-0044 rows only. Nothing writes these; build_context_block still reads them so a
    # replayed run reproduces the prompt it originally got.
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


class SteerBlockRequest(BaseModel):
    """Edit one step to an instruction (PRD §6.1).

    The step's TEXT is deliberately not a field: the worker reads it from the database. A
    client-supplied body would be a way to hand the model text that is not in the article.
    `selection` is context — where the user's attention was — and is capped in the prompt.
    """

    article_id: str
    step_number: int
    instruction: str
    selection: str = ""


class SteerArticleRequest(BaseModel):
    """The same instruction, article-wide (PRD §6.4)."""

    article_id: str
    instruction: str


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

    EMPHASIS. Both prompts may return `**bold**` and `*italic*`, and only those two, which
    become <strong> and <em> here. The editor has offered bold and italic since it shipped
    and generation never produced either, so every generated article arrived as flat prose
    -- and the one thing worth emphasising in a help article, the literal on-screen label
    the reader has to find, read exactly like the words around it.

    The model returns a CONVENTION, never markup. That is the whole safety argument: the
    escape below runs FIRST, so those two tags are the only ones that can exist in the
    result, and a recording showing an `<img onerror=...>` on screen is still inert text by
    the time the patterns are applied. Widening this to "the model may emit HTML" would hand
    every pixel of the user's screen a path into the reader's DOM.
    """
    s = (text or "").strip()
    if not s:
        return ""
    # ALREADY-MARKUP PASS-THROUGH, narrowed to the block tags this function itself emits.
    # It used to be `s.startswith("<")`, which returned ANY string beginning with a tag
    # verbatim -- and in the worker this function only ever receives MODEL output, whose
    # text is drawn from what was on the user's screen. A step body starting with
    # `<img onerror=...>` was therefore stored raw. The reader's DOMPurify still stripped
    # it, so this was never live XSS, but "escaped unless we recognise it" is the property
    # the emphasis conversion above is claiming, and it has to actually hold.
    if _BLOCK_START.match(s):
        return s
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Bold first: `**x**` would otherwise be eaten as two empty italics from the outside
    # in. Neither may span a blank line or wrap whitespace, so a stray or unmatched
    # asterisk is left alone as the literal character it is.
    s = _BOLD.sub(r"<strong>\1</strong>", s)
    s = _ITALIC.sub(r"<em>\1</em>", s)
    # Blank lines separate paragraphs, which is what TipTap does with pasted prose. Single
    # newlines are joined -- a wrapped sentence is one sentence.
    paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", s)]
    return "".join(f"<p>{p}</p>" for p in paras if p)
if __name__ == "__main__":  # `python models.py` — the JSON contract, no server needed
    # canonical_body is the ONLY place model prose becomes markup, so it is the only place
    # a recording's on-screen text could become a tag. Every case below is either the
    # emphasis feature working or that boundary holding.
    _cases = [
        # The feature: the two marks the editor has always offered, now generated.
        ("Tap **Ask ChatGPT** to begin.", "<p>Tap <strong>Ask ChatGPT</strong> to begin.</p>"),
        ("Choose *Settings* first.", "<p>Choose <em>Settings</em> first.</p>"),
        ("Press **Save** then *Done*.", "<p>Press <strong>Save</strong> then <em>Done</em>.</p>"),
        # Asterisks that are not emphasis stay as typed.
        ("A 2 * 3 grid.", "<p>A 2 * 3 grid.</p>"),
        ("Unmatched **bold here", "<p>Unmatched **bold here</p>"),
        # A mark may not pair across a paragraph break and swallow what is between.
        ("start **one\n\ntwo** end", "<p>start **one</p><p>two** end</p>"),
        ("**a**\n\n**b**", "<p><strong>a</strong></p><p><strong>b</strong></p>"),
        # The three characters TipTap escapes, escaped the same way.
        ("a < b & c > d", "<p>a &lt; b &amp; c &gt; d</p>"),
        # Already-markup round-trips; anything else is prose and gets escaped.
        ("<p>already markup</p>", "<p>already markup</p>"),
        ("", ""),
    ]
    for _src, _want in _cases:
        assert canonical_body(_src) == _want, (_src, canonical_body(_src), _want)

    # THE BOUNDARY. A step whose text begins with a tag the recording put on screen must be
    # escaped, not passed through — `startswith("<")` used to hand it straight to the
    # database. Emphasis still applies to the rest of the sentence.
    # THE ALLOWLIST, from the other side: `**` and `*` are recognised, and EVERY other
    # markup convention a model might reach for is inert text. These are the exact payloads
    # the brief asks to see rendered literally, and the property they assert -- the only
    # tags in a stored body are <p>, <strong> and <em>, and every model-authored angle
    # bracket is an entity -- is what makes BOTH renderers safe. The reader sanitizes with
    # DOMPurify and the editor reparses through TipTap's schema; neither can un-escape an
    # entity, so this is the boundary that has to hold.
    for _src, _want in [
        ("See [the docs](https://evil.test) first.",
         "<p>See [the docs](https://evil.test) first.</p>"),
        ("Run `rm -rf /` now.", "<p>Run `rm -rf /` now.</p>"),
        ("```js\nalert(1)\n```", "<p>```js alert(1) ```</p>"),
        ("<script>alert(1)</script>",
         "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"),
        ("# Heading", "<p># Heading</p>"),
        ("- a list item", "<p>- a list item</p>"),
        ("_not italic_", "<p>_not italic_</p>"),
    ]:
        assert canonical_body(_src) == _want, (_src, canonical_body(_src), _want)

    _inj = canonical_body("<img onerror=alert(1)> shown **on screen**")
    assert _inj == "<p>&lt;img onerror=alert(1)&gt; shown <strong>on screen</strong></p>", _inj
    assert "<img" not in _inj

    print("models OK")
