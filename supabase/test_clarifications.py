"""Live acceptance run for the paused generation flow (migrations 0042, 0043).

    cd supabase && ../worker/.venv/Scripts/python test_clarifications.py

Run it after touching submit_clarification_answers, the jobs column allowlist, or
worker/clarify.py's answer validation.

Everything a client does goes through the ANON KEY in a real signed-in session. §10e.2 is
the reason: `profiles.plan` was world-writable while the SQL looked correct, so a column
grant is only proven by being a client and failing to read it.

The five facts that matter:

  * `clarification_answers` is NOT readable by a client, while `clarifications` and
    `awaiting_input` are — 0042 grants exactly two of the three;
  * a member with can_edit_kb() can release the write stage, and a stranger cannot;
  * an answer the question never offered is DROPPED rather than stored, and so is an
    answer to a question index that does not exist;
  * `element_name` is the only type that accepts a literal, and it is capped;
  * a second press returns false instead of raising — people double-tap.

Creates two throwaway auth users, one KB and one job row, and deletes all of them in the
finally block whatever happens.
"""
import os
import sys
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
os.chdir(os.path.join(ROOT, "worker"))
import config  # noqa: E402
import pipeline  # noqa: E402
from supabase import create_client  # noqa: E402

ANON = [
    l.split("=", 1)[1].strip()
    for l in open(os.path.join(ROOT, "web", ".env.local"))
    if l.startswith("VITE_SUPABASE_ANON_KEY")
][0]

db = pipeline.db()
fails: list[str] = []


def chk(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok:
        fails.append(label)


def mk(tag):
    email = f"cl-{tag}-{uuid.uuid4().hex[:6]}@example.com"
    pw = "Cx!" + uuid.uuid4().hex[:8]
    u = db.auth.admin.create_user({"email": email, "password": pw, "email_confirm": True})
    time.sleep(0.9)
    return u.user.id, email, pw


def signin(email, pw):
    c = create_client(config.SUPABASE_URL, ANON)
    c.auth.sign_in_with_password({"email": email, "password": pw})
    return c


def err(fn):
    try:
        fn()
        return None
    except Exception as e:                                              # noqa: BLE001
        return str(e)


# Two questions: one with a fixed option set, one free-text-capable.
QUESTIONS = [
    {
        "type": "variable_value",
        "evidence": {"timestamp": "00:27", "step_index": 0},
        "slots": {"field_label": "Form title", "typed_value": "Food Review"},
        "options": [{"id": "variable", "label": "Their own"},
                    {"id": "literal", "label": "Always this"}],
        "default_option_id": "variable",
    },
    {
        "type": "element_name",
        "evidence": {"timestamp": "00:38", "step_index": 0},
        "slots": {"element_description": "the unlabelled tab"},
        "options": [{"id": "by_function", "label": "Describe it"},
                    {"id": "members", "label": "Members"}],
        "default_option_id": "by_function",
    },
]


def new_job(kb_id, owner_id):
    row = db.table("jobs").insert({
        "kb_id": kb_id, "user_id": owner_id, "billed_to_user_id": owner_id,
        "status": "running", "stage": "capturing",
        "clarifications": QUESTIONS, "awaiting_input": True,
        "awaiting_input_at": "now()",
    }).execute().data[0]
    return row["id"]


def stored(job_id):
    return db.table("jobs").select(
        "awaiting_input, clarification_answers, clarifications_closed_at"
    ).eq("id", job_id).single().execute().data


def main() -> int:
    owner_id = member_id = stranger_id = None
    kb_id = None
    try:
        owner_id, o_email, o_pw = mk("own")
        member_id, m_email, m_pw = mk("mem")
        stranger_id, s_email, s_pw = mk("out")

        kb_id = str(uuid.uuid4())
        db.table("knowledge_bases").insert({
            "id": kb_id, "owner_id": owner_id, "name": "Clarification test",
            "subdomain": f"cltest-{uuid.uuid4().hex[:8]}",
        }).execute()
        db.table("kb_members").insert(
            {"kb_id": kb_id, "user_id": member_id, "role": "admin"}
        ).execute()

        owner = signin(o_email, o_pw)
        member = signin(m_email, m_pw)
        stranger = signin(s_email, s_pw)

        job = new_job(kb_id, owner_id)

        print("\n1. The column allowlist (0042) — two granted, one not")
        row = (owner.table("jobs").select("clarifications, awaiting_input")
               .eq("id", job).single().execute().data)
        chk("the client can read the questions", len(row["clarifications"]), 2)
        chk("...and whether the run is waiting", row["awaiting_input"], True)
        chk(
            "clarification_answers is NOT readable by a client",
            "permission denied" in (err(lambda: owner.table("jobs")
                .select("clarification_answers").eq("id", job).execute()) or "").lower(),
            True,
        )
        chk(
            "neither are the two drop-off timestamps",
            "permission denied" in (err(lambda: owner.table("jobs")
                .select("awaiting_input_at").eq("id", job).execute()) or "").lower(),
            True,
        )

        print("\n2. A stranger cannot release someone else's run")
        chk(
            "stranger refused",
            "not your job" in (err(lambda: stranger.rpc(
                "submit_clarification_answers",
                {"p_job_id": job, "p_answers": {"0": "literal"}}).execute()) or "").lower(),
            True,
        )
        chk("...and the run is still waiting", stored(job)["awaiting_input"], True)
        # A job id that does not exist answers IDENTICALLY, so the parameter is not a probe.
        chk(
            "an unknown job id is refused the same way",
            "not your job" in (err(lambda: owner.rpc(
                "submit_clarification_answers",
                {"p_job_id": str(uuid.uuid4()), "p_answers": {}}).execute()) or "").lower(),
            True,
        )

        print("\n3. Answers are checked against what the question OFFERED")
        chk(
            "a member releases the write stage",
            member.rpc("submit_clarification_answers", {
                "p_job_id": job,
                "p_answers": {
                    "0": "literal",        # offered -> kept
                    "1": "Members panel",  # element_name literal -> kept
                    "9": "variable",       # no such question -> dropped
                },
                "p_note": "Brand new screen.",
            }).execute().data,
            True,
        )
        after = stored(job)
        chk("the offered id was stored", after["clarification_answers"]["answers"].get("0"), "literal")
        chk("the element_name literal was stored",
            after["clarification_answers"]["answers"].get("1"), "Members panel")
        chk("an index with no question was dropped",
            "9" in after["clarification_answers"]["answers"], False)
        chk("the note rode along", after["clarification_answers"]["note"], "Brand new screen.")
        chk("the write stage is released", after["awaiting_input"], False)
        chk("...and the moment is stamped", after["clarifications_closed_at"] is not None, True)

        print("\n4. A second press is not an error")
        chk("already released returns false",
            owner.rpc("submit_clarification_answers",
                      {"p_job_id": job, "p_answers": {"0": "variable"}}).execute().data, False)
        chk("...and did not overwrite the first answer",
            stored(job)["clarification_answers"]["answers"].get("0"), "literal")

        print("\n5. An unoffered value cannot get in, on a fresh run")
        job2 = new_job(kb_id, owner_id)
        owner.rpc("submit_clarification_answers", {
            "p_job_id": job2,
            "p_answers": {"0": "whatever-i-like", "1": "x" * 200},
            "p_note": "y" * 900,
        }).execute()
        a2 = stored(job2)["clarification_answers"]
        chk("an id the question never offered is dropped", a2["answers"], {})
        chk("...including an over-length element_name literal", "1" in a2["answers"], False)
        chk("the note is capped at 600", len(a2["note"]), 600)
        chk("and the run still released", stored(job2)["awaiting_input"], False)

        print("\n6. Skipping everything is a valid release")
        job3 = new_job(kb_id, owner_id)
        chk("no answers at all still releases",
            owner.rpc("submit_clarification_answers",
                      {"p_job_id": job3, "p_answers": {}}).execute().data, True)
        chk("...with an empty answer set, not a null one",
            stored(job3)["clarification_answers"]["answers"], {})

    finally:
        if kb_id:
            db.table("jobs").delete().eq("kb_id", kb_id).execute()
            db.table("knowledge_bases").delete().eq("id", kb_id).execute()
        for uid in (owner_id, member_id, stranger_id):
            if uid:
                try:
                    db.auth.admin.delete_user(uid)
                except Exception:                                        # noqa: BLE001
                    pass

    print("\n" + ("FAILED: " + ", ".join(fails) if fails else "all checks passed"))
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
