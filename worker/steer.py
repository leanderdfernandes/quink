"""Steerable editing (PRD "Context & AI Editing" §6.1 and §6.4).

Two scopes, one idea: the user says what they want in their own words, and gets back a
DIFF — never a write.

  block    one step, from a selection. The commodity half: any chat model can shorten a
           paragraph, so this is table stakes rather than the product, and it is priced
           accordingly (unlimited, PRD §8).
  article  the same instruction, wider scope. It states a PLAN first — which steps change
           and how — before any diff lands, because a multi-step edit that just happens
           underneath the user feels like the article shifted rather than like they steered
           it.

WHY FIXED VERBS WERE NOT BUILT. "Shorten / Simplify / Rewrite" decide for the user what
better means. The journey map's actual complaint is a KNOWING problem — "what to change it
to is what the tool is supposed to do" — and a fixed verb answers a different question than
the one being asked. So: one instruction field, and the quick words FILL it rather than
firing, because a starting phrase someone extends is not the same thing as a decision made
for them.

TRUST BOUNDARY (§7). The article body is UNTRUSTED — it may carry text injected through the
recording — so it is fenced, and so is the instruction, which is user-supplied. Output is
JSON against a schema and is REJECTED rather than repaired. Output length is ceilinged
against input: an edit that returns four times what it was given has stopped editing and
started writing, whatever it was asked for.

The cheap model, deliberately: this is grammar and phrasing over text somebody already has.
The video model exists for the one job only it can do (recheck.py).
"""

import logging

from pydantic import BaseModel, Field, field_validator

import config
import failures
import gemini
import prompts

log = logging.getLogger("quink.steer")


def _ceiling(source: str) -> int:
    """How long a replacement for `source` may be before it stops being an edit.

    Generous, because "explain why" legitimately grows a sentence into two, and because a
    hard refusal on a good edit is worse than a long one. It exists for the case where the
    model answers a two-line step with an essay — which is what happens when an instruction
    is read as a writing brief rather than as an edit.
    """
    return max(int(len(source) * config.STEER_LENGTH_CEILING), len(source) + 240)


class BlockEdit(BaseModel):
    proposed_text: str = Field(min_length=1)

    @field_validator("proposed_text")
    @classmethod
    def _tidy(cls, v: str) -> str:
        return " ".join((v or "").split())


class PlannedChange(BaseModel):
    step_number: int
    # ONE short line: what changes about this step. Rendered above the diffs, never instead
    # of them — the plan is what stops a multi-step edit feeling like the article moved.
    change: str = Field(min_length=1, max_length=140)


class StepEdit(BaseModel):
    step_number: int
    proposed_text: str = Field(min_length=1)

    @field_validator("proposed_text")
    @classmethod
    def _tidy(cls, v: str) -> str:
        return " ".join((v or "").split())


class ArticleEdit(BaseModel):
    plan: list[PlannedChange] = Field(default_factory=list)
    steps: list[StepEdit] = Field(default_factory=list)


def edit_block(*, body_text: str, selection: str, instruction: str) -> dict:
    """One step, rewritten to an instruction. Returns {proposed_text, instruction}.

    `body_text` is read from the database by the caller, never taken from the client: the
    browser's copy is what the user is looking at, and what we must edit is what is stored.
    """
    instruction = " ".join((instruction or "").split())[: config.STEER_INSTRUCTION_MAX]
    if not instruction:
        raise failures.Failed(failures.STEER_EMPTY, "no instruction given")

    answer = gemini.generate_json(
        model=config.TEXT_MODEL,
        contents=[
            prompts.build_steer_block_prompt(
                instruction=instruction,
                body_text=body_text,
                selection=" ".join((selection or "").split())[:1000],
            )
        ],
        schema=BlockEdit,
    )
    ceiling = _ceiling(body_text)
    if len(answer.proposed_text) > ceiling:
        # REJECTED, not truncated. Half a sentence is a worse answer than "that didn't
        # work", and truncating would hide the fact that the model stopped editing.
        raise failures.Failed(
            failures.MODEL_BAD_OUTPUT,
            f"steer returned {len(answer.proposed_text)} chars against a ceiling of {ceiling}",
        )
    return {"proposed_text": answer.proposed_text, "instruction": instruction}


def edit_article(*, steps: list[dict], instruction: str) -> dict:
    """The whole article, to one instruction. Returns {plan, steps, instruction}.

    Only steps the model actually names come back, and every one is matched to a real
    step_number before it is returned — a proposal for a step that does not exist is
    dropped rather than repaired, the same rule clarify.py follows for questions.
    """
    instruction = " ".join((instruction or "").split())[: config.STEER_INSTRUCTION_MAX]
    if not instruction:
        raise failures.Failed(failures.STEER_EMPTY, "no instruction given")

    by_number = {s["step_number"]: s for s in steps}
    answer = gemini.generate_json(
        model=config.TEXT_MODEL,
        contents=[
            prompts.build_steer_article_prompt(
                instruction=instruction,
                article_block=prompts.build_article_block(steps),
            )
        ],
        schema=ArticleEdit,
    )

    proposals = []
    for edit in answer.steps:
        source = by_number.get(edit.step_number)
        if source is None:
            log.warning("steer: dropped a proposal for unknown step %s", edit.step_number)
            continue
        if len(edit.proposed_text) > _ceiling(source.get("body_text") or ""):
            log.warning("steer: dropped an over-length proposal for step %s", edit.step_number)
            continue
        proposals.append(
            {"step_number": edit.step_number, "proposed_text": edit.proposed_text}
        )

    # A plan naming steps that produced no proposal is a plan that lies about what is about
    # to happen. Keep only the lines that have a diff behind them.
    changed = {p["step_number"] for p in proposals}
    plan = [
        {"step_number": p.step_number, "change": p.change}
        for p in answer.plan
        if p.step_number in changed
    ]
    return {"plan": plan, "steps": proposals, "instruction": instruction}


def demo() -> None:
    """`python steer.py`. No network: the model is faked.

    The assertions are about the BOUNDARY, not the prose — the ceiling, the dropped
    proposal for a step that does not exist, and the plan not being allowed to promise a
    change that has no diff behind it.
    """
    import json

    payload: dict = {}

    class _Resp:
        def __init__(self, p):
            self.text = json.dumps(p)
            self.candidates = []
            self.prompt_feedback = None

    gemini._call_with_transport_retry = lambda _m, _c: _Resp(payload)

    body = "Press the button to save your changes."
    payload = {"proposed_text": "Press Save."}
    out = edit_block(body_text=body, selection="Press the button", instruction="shorter")
    assert out == {"proposed_text": "Press Save.", "instruction": "shorter"}, out

    # An empty instruction never reaches the model — there is nothing to steer toward.
    try:
        edit_block(body_text=body, selection="", instruction="   ")
        raise AssertionError("an empty instruction must be refused")
    except failures.Failed as e:
        assert e.code == failures.STEER_EMPTY

    # The ceiling. An "edit" four times the length of its input has started writing.
    payload = {"proposed_text": "x " * 900}
    try:
        edit_block(body_text=body, selection="", instruction="explain why")
        raise AssertionError("an over-length replacement must be rejected")
    except failures.Failed as e:
        assert e.code == failures.MODEL_BAD_OUTPUT

    steps = [
        {"step_number": 1, "heading": "Open it", "body_text": "Click the menu."},
        {"step_number": 2, "heading": "Save", "body_text": "Press the button to save."},
    ]
    payload = {
        "plan": [
            {"step_number": 1, "change": "Name the menu"},
            {"step_number": 2, "change": "Name the button"},
            {"step_number": 9, "change": "Something about a step that is not there"},
        ],
        "steps": [
            {"step_number": 1, "proposed_text": "Click the File menu."},
            {"step_number": 9, "proposed_text": "Invented."},
        ],
    }
    out = edit_article(steps=steps, instruction="name the controls")
    assert [p["step_number"] for p in out["steps"]] == [1], out["steps"]
    # Step 2 was PLANNED but never proposed, and step 9 does not exist. Neither may appear
    # in a plan the user is about to trust.
    assert [p["step_number"] for p in out["plan"]] == [1], out["plan"]

    print("steer self-check OK")


if __name__ == "__main__":
    demo()
