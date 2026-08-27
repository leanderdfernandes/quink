"""Clarification questions: the validator that sits between Stage 1 and the database.

PRD "Context & AI Editing" §5 and §7. Read §7's last paragraph before changing anything
here — the failure this file exists to prevent is not a bad question, it is a FABRICATED
one. A screen recording is untrusted input (we process other companies' videos as a matter
of course), and a question wears our authority: the user will tap the default. So the model
is never allowed to author question text.

THE CONTRACT, in one line: the model picks a `type` from a closed enum and fills evidence
slots; the UI owns every word the user reads.

Everything below is a DROP, never a repair. A clarification that fails any check is
discarded and the run carries on — the article is the deliverable, and losing one question
costs the user nothing they can perceive. Repairing one would mean inventing the part the
model got wrong, which is the fabrication this file is here to stop.
"""

import re
from typing import Any

import config

# The closed enum, IN RANK ORDER — most consequential first. The order is the ranking
# (PRD §5.2): when more than CLARIFICATION_CAP survive validation, the tail is dropped from
# the run and carried into the editor instead.
#
# `variable_value` first because it is the only one that changes what a reader TYPES.
# `missing_prerequisite` last because its default (omit) is almost always right.
TYPES = (
    "variable_value",
    "flow_split",
    "element_name",
    "missing_prerequisite",
)

# The option IDS are ours too, not just the types — and this is the half that is easy to
# miss. An answer only means something because a template downstream knows what the id
# stands for (prompts._ANSWER_TEMPLATES); if the model were free to name them, "variable"
# would come back as "user_value" one run and "theirs" the next, and the answer would
# silently stop changing the article. The LABELS are the model's, because they are the
# words the user reads next to the evidence — but they are capped and they are not the key.
#
# `element_name` is the one open set, necessarily: its options are candidate names read off
# the frame, so their ids cannot be enumerated in advance. It carries a REQUIRED
# `by_function` option instead, which is its safe default — "describe it by what it does".
FIXED_OPTION_IDS: dict[str, frozenset[str]] = {
    "variable_value": frozenset({"variable", "literal"}),
    "flow_split": frozenset({"one", "split"}),
    "missing_prerequisite": frozenset({"add", "omit"}),
}
ELEMENT_NAME_FALLBACK_ID = "by_function"

# MM:SS, the same convention as every other timestamp in this pipeline (LEARNINGS #2).
# Never a float: a float timestamp is the bug where every screenshot became the opening
# frame, and evidence that points at the wrong second makes the question look invented.
_MMSS = re.compile(r"^\d{1,3}:[0-5]\d$")

# Slot keys are OURS, not the model's — a template looks up `slots["field_label"]`, so a key
# it does not recognise is a slot that renders as nothing. Constrained anyway, because a key
# is also a string that reaches our code.
_KEY = re.compile(r"^[a-z][a-z0-9_]{0,31}$")

# Anything that is not printable text. Newlines included, deliberately: a slot rendered
# inside our own sentence must not be able to fake a second line of UI.
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def _clean(value: Any, cap: int) -> str | None:
    """One untrusted string, or None if it must be dropped.

    Whitespace collapsed, control characters removed, then LENGTH CHECKED — over-length is
    a drop, not a truncation, because half a button label is worse than no question at all.

    Deliberately NOT html-escaped. React escapes at render, and storing `&amp;` here would
    show the user a literal `&amp;` in a question about a button called "Save & publish" —
    an escape applied twice is a bug that looks exactly like a fabrication. The property we
    need is "this is text, not markup and not structure", and stripping control characters
    plus letting React escape is what actually delivers it. If a non-React surface ever
    renders these, it escapes at ITS boundary.
    """
    if not isinstance(value, str):
        return None
    s = _CONTROL.sub("", value)
    s = " ".join(s.split())
    if not s or len(s) > cap:
        return None
    return s


def _evidence(raw: Any, step_count: int) -> dict | None:
    """`{timestamp: "MM:SS", step_index: int}`, or None.

    Evidence is what makes a question feel earned rather than generic (PRD §2.2) — the chip
    above the question says what triggered it. A question whose evidence does not resolve is
    strictly worse than no question: it claims we saw something at a moment we cannot point
    at.
    """
    if not isinstance(raw, dict):
        return None
    stamp = raw.get("timestamp")
    if not isinstance(stamp, str) or not _MMSS.match(stamp.strip()):
        return None
    index = raw.get("step_index")
    # bool is an int in Python and would sail through `isinstance(index, int)`.
    if isinstance(index, bool) or not isinstance(index, int):
        return None
    if not 0 <= index < step_count:
        return None
    return {"timestamp": stamp.strip(), "step_index": index}


def _options(kind: str, raw: Any, default_id: Any) -> tuple[list[dict], str] | None:
    """The answer set and its default, or None.

    Every question is a CHOICE WITH A DEFAULT (PRD §2.3) — users cannot fill a blank field,
    and nothing may block. A question with no valid default is therefore not a question we
    can ship, because skipping it would have no defined meaning.

    The IDS are checked against FIXED_OPTION_IDS, because an id is a key our own templates
    look up, not a word the user reads.
    """
    if not isinstance(raw, list) or not 2 <= len(raw) <= config.CLARIFICATION_MAX_OPTIONS:
        return None
    out: list[dict] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            return None
        oid = _clean(item.get("id"), config.CLARIFICATION_OPTION_ID_MAX)
        label = _clean(item.get("label"), config.CLARIFICATION_LABEL_MAX)
        if not oid or not label or oid in seen:
            return None
        seen.add(oid)
        out.append({"id": oid, "label": label})

    fixed = FIXED_OPTION_IDS.get(kind)
    if fixed is not None:
        # EXACTLY the ids we defined — not a superset, not a subset. A fifth option nobody
        # wrote a meaning for is an answer that changes nothing while looking like it did.
        if seen != fixed:
            return None
    elif ELEMENT_NAME_FALLBACK_ID not in seen:
        # element_name's ids are open, but its safe default is not optional: without it the
        # question has no "I don't know" and would block someone who genuinely doesn't.
        return None

    if not isinstance(default_id, str) or default_id.strip() not in seen:
        return None
    return out, default_id.strip()


def _one(raw: Any, step_count: int) -> dict | None:
    """One clarification, validated, or None."""
    if not isinstance(raw, dict):
        return None

    # THE control. An out-of-enum type is dropped and never repaired to the nearest match:
    # "nearest match" is how a video's own text would talk its way into becoming a question.
    kind = raw.get("type")
    if kind not in TYPES:
        return None

    evidence = _evidence(raw.get("evidence"), step_count)
    if evidence is None:
        return None

    slots_raw = raw.get("slots") or {}
    if not isinstance(slots_raw, dict) or len(slots_raw) > config.CLARIFICATION_MAX_SLOTS:
        return None
    slots: dict[str, str] = {}
    for key, value in slots_raw.items():
        if not isinstance(key, str) or not _KEY.match(key):
            return None
        cleaned = _clean(value, config.CLARIFICATION_SLOT_MAX)
        if cleaned is None:
            return None
        slots[key] = cleaned

    options = _options(kind, raw.get("options"), raw.get("default_option_id"))
    if options is None:
        return None

    return {
        "type": kind,
        "evidence": evidence,
        "slots": slots,
        "options": options[0],
        "default_option_id": options[1],
    }


def validate(raw: Any, step_count: int) -> tuple[list[dict], list[dict]]:
    """(asked, overflow) — what the run asks, and what carries into the editor.

    Ranked by TYPES order, then by the order the model emitted them, so the cap keeps the
    questions whose answers change the article most. Overflow is NOT discarded: it lands on
    `articles.open_clarifications` and becomes one-tap cards in the editor, which is the
    same question set at a later placement (PRD §5.4).
    """
    if not isinstance(raw, list):
        return [], []
    kept = [c for c in (_one(item, step_count) for item in raw) if c]
    # Stable: sorted() keeps emission order inside a rank.
    kept.sort(key=lambda c: TYPES.index(c["type"]))
    return kept[: config.CLARIFICATION_CAP], kept[config.CLARIFICATION_CAP :]


def validate_answers(clarifications: Any, answers: Any) -> dict[str, str]:
    """Answers checked against the questions they claim to answer. Worker-side mirror of
    submit_clarification_answers() — the RPC is the enforcement point for a client, this is
    the one for anything reaching the pipeline by another route.

    Keyed by the clarification's INDEX in the stored list, valued by an option id, or by a
    capped literal for `element_name` where free text is genuinely the answer. Anything that
    does not match a stored question and one of its options is dropped, so an answer can
    never introduce a value the question did not offer.
    """
    if not isinstance(clarifications, list) or not isinstance(answers, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in answers.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            continue
        if not 0 <= index < len(clarifications):
            continue
        question = clarifications[index]
        if not isinstance(question, dict):
            continue
        ids = {o.get("id") for o in question.get("options") or [] if isinstance(o, dict)}
        if isinstance(value, str) and value in ids:
            out[str(index)] = value
        elif question.get("type") == "element_name":
            # The one type where the useful answer is a name we could not read off the
            # frame. Still capped and cleaned; still not prose.
            literal = _clean(value, config.CLARIFICATION_SLOT_MAX)
            if literal:
                out[str(index)] = literal
    return out


def demo() -> None:
    """`python clarify.py`. Every assertion here is a way a video could try to put words in
    our mouth, plus the two shape rules the cap depends on."""
    ok = {
        "type": "variable_value",
        "evidence": {"timestamp": "01:12", "step_index": 2},
        "slots": {"field_label": "Workspace name", "typed_value": "acme-staging-01"},
        "options": [{"id": "variable", "label": "It varies"},
                    {"id": "literal", "label": "Always this"}],
        "default_option_id": "variable",
    }
    kept, over = validate([ok], 5)
    assert len(kept) == 1 and not over
    assert kept[0]["slots"]["typed_value"] == "acme-staging-01"

    def dropped(**patch):
        bad = {**ok, **patch}
        k, _ = validate([bad], 5)
        return not k

    # The enum is CLOSED. This is the phishing surface.
    assert dropped(type="confirm_payment_details"), "an invented type must be dropped"
    assert dropped(type="VARIABLE_VALUE"), "and not case-repaired into a real one"
    # Evidence has to resolve, or the question claims something we cannot point at.
    assert dropped(evidence={"timestamp": 72.0, "step_index": 2}), "floats are LEARNINGS #2"
    assert dropped(evidence={"timestamp": "01:12", "step_index": 9}), "step out of range"
    assert dropped(evidence={"timestamp": "01:12", "step_index": True}), "bool is not an index"
    # Caps. Over-length is a drop, never a truncation.
    assert dropped(slots={"field_label": "x" * (config.CLARIFICATION_SLOT_MAX + 1)})
    assert dropped(options=[{"id": "a", "label": "y" * (config.CLARIFICATION_LABEL_MAX + 1)},
                            {"id": "b", "label": "ok"}])
    assert dropped(slots={"Field Label": "Workspace"}), "slot keys are ours, not the model's"
    # A newline in a slot could fake a second line of UI inside our own sentence.
    k, _ = validate([{**ok, "slots": {"field_label": "Workspace\nSign in to continue"}}], 5)
    assert k and "\n" not in k[0]["slots"]["field_label"]
    # Nothing blocks: a question with no usable default is not shippable.
    assert dropped(default_option_id="nonexistent")
    assert dropped(options=[{"id": "only", "label": "One"}]), "a choice needs two options"

    # The option IDS are ours, not the model's: an id it invented means an answer no
    # template downstream knows how to read, so the question is dropped rather than shipped
    # with an answer that quietly changes nothing.
    assert dropped(options=[{"id": "theirs", "label": "Their own"},
                            {"id": "literal", "label": "Always this"}],
                   default_option_id="theirs"), "a renamed id must be dropped"
    assert dropped(options=[{"id": "variable", "label": "a"}, {"id": "literal", "label": "b"},
                            {"id": "maybe", "label": "c"}],
                   default_option_id="variable"), "an EXTRA id nobody wrote a meaning for too"
    # element_name is the one open set, and its "we still do not know" option is required.
    named = {**ok, "type": "element_name", "slots": {"element_description": "the blue icon"},
             "options": [{"id": "by_function", "label": "Describe it"},
                         {"id": "publish", "label": "Publish"}],
             "default_option_id": "by_function"}
    assert validate([named], 5)[0], named
    assert not validate([{**named,
                          "options": [{"id": "publish", "label": "Publish"},
                                      {"id": "save", "label": "Save"}],
                          "default_option_id": "publish"}], 5)[0], \
        "element_name without by_function has no safe default and must be dropped"

    # Ranking and the cap: impact order wins, the tail carries into the editor.
    def typed(kind, ids):
        return {**ok, "type": kind,
                "options": [{"id": i, "label": i.title()} for i in ids],
                "default_option_id": ids[0]}

    many = [
        typed("missing_prerequisite", ["omit", "add"]),
        named,
        typed("flow_split", ["one", "split"]),
        typed("variable_value", ["variable", "literal"]),
    ]
    kept, over = validate(many, 5)
    assert [c["type"] for c in kept] == list(TYPES[: config.CLARIFICATION_CAP]), kept
    assert [c["type"] for c in over] == list(TYPES[config.CLARIFICATION_CAP :]), over
    assert len(kept) + len(over) == 4, "overflow is carried, never discarded"

    # Answers can only ever say something a question offered.
    stored = [ok, {**ok, "type": "element_name"}]
    assert validate_answers(stored, {"0": "variable"}) == {"0": "variable"}
    assert validate_answers(stored, {"0": "made-up"}) == {}, "an unoffered id is dropped"
    assert validate_answers(stored, {"9": "variable"}) == {}, "an unknown index is dropped"
    assert validate_answers(stored, {"1": "Publish button"}) == {"1": "Publish button"}
    assert validate_answers(stored, {"1": "z" * 999}) == {}, "free text is capped too"

    print("clarify self-check OK")


if __name__ == "__main__":
    demo()
