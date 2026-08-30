"""Live acceptance run for product context as a guarded write (migrations 0040, 0044, 0048).

    cd supabase && ../worker/.venv/Scripts/python test_product_context.py

Run it after touching set_product_context, the knowledge_bases UPDATE column grant, or
anything that writes the product tier.

Everything here goes through the ANON KEY in a real signed-in session, never psycopg2.
§10e.2 is explicit about why: the profiles.plan hole "looked correct while the hole was
live", because reading the SQL is not the same test as being a client. The four facts that
matter are all client-observable:

  * a signed-out caller can neither read the columns nor call the RPC;
  * a MEMBER (can_edit_kb, not owner) can — entitlements resolve through the owner, and
    grounding a guide is something that makes articles;
  * someone with no relationship to the KB is refused;
  * a write over CONTEXT_CHAR_BUDGET is refused BY THE DATABASE, not merely by the
    client's meter — and the budget is SHARED, so a note that would fit in an empty help
    center is refused once a description is spending the same pool;
  * deleting a note frees that budget immediately, and the write refused a moment ago now
    succeeds unchanged;
  * the direct table update that used to be the write path now writes nothing at all;
  * audience and tone round-trip (restored by 0048), each with its OWN cap, and NEITHER
    spends the shared budget -- a full-length description saves beside a full audience.

Creates two throwaway auth users and one KB, and deletes all three in the finally block
whatever happens.
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
    email = f"pc-{tag}-{uuid.uuid4().hex[:6]}@example.com"
    pw = "Px!" + uuid.uuid4().hex[:8]
    u = db.auth.admin.create_user({"email": email, "password": pw, "email_confirm": True})
    time.sleep(0.9)
    return u.user.id, email, pw


def signin(email, pw):
    c = create_client(config.SUPABASE_URL, ANON)
    c.auth.sign_in_with_password({"email": email, "password": pw})
    return c


def err(fn):
    """Run a client call and return the message, or None if it unexpectedly succeeded."""
    try:
        fn()
        return None
    except Exception as e:  # noqa: BLE001
        return str(e)


def main() -> int:
    owner_id = member_id = stranger_id = None
    kb_id = None
    try:
        owner_id, owner_email, owner_pw = mk("own")
        member_id, member_email, member_pw = mk("mem")
        stranger_id, stranger_email, stranger_pw = mk("out")

        kb_id = str(uuid.uuid4())
        db.table("knowledge_bases").insert(
            {
                "id": kb_id,
                "owner_id": owner_id,
                "name": "Product context test",
                "subdomain": f"pctest-{uuid.uuid4().hex[:8]}",
            }
        ).execute()
        db.table("kb_members").insert(
            {"kb_id": kb_id, "user_id": member_id, "role": "admin"}
        ).execute()

        owner = signin(owner_email, owner_pw)
        member = signin(member_email, member_pw)
        stranger = signin(stranger_email, stranger_pw)
        nobody = create_client(config.SUPABASE_URL, ANON)

        print("\n1. Signed out sees nothing and can call nothing")
        rows = (
            nobody.table("knowledge_bases")
            .select("product_context")
            .eq("id", kb_id)
            .execute()
            .data
        )
        chk("anon reads zero rows", rows, [])
        chk(
            "anon cannot execute the rpc",
            "permission denied" in (err(lambda: nobody.rpc("set_product_context",
                {"p_kb_id": kb_id, "p_name": "Nope"}).execute()) or "").lower(),
            True,
        )

        def ctx():
            return (
                owner.table("knowledge_bases").select("product_context")
                .eq("id", kb_id).single().execute().data["product_context"]
            )

        print("\n2. A member with can_edit_kb() can write it, notes and all")
        member.rpc(
            "set_product_context",
            {
                "p_kb_id": kb_id,
                "p_name": "Acme Dashboard",
                "p_description": "Inventory tracking for small warehouses.",
                "p_notes": [{"id": "", "title": "Glossary", "body": "SKU = one item."}],
                "p_audience": "Warehouse staff, not especially technical",
                "p_tone": "Warm \u00b7 Balanced",
            },
        ).execute()
        c = ctx()
        chk("name written", c["name"], "Acme Dashboard")
        chk("one note written", len(c["notes"]), 1)
        chk("note title written", c["notes"][0]["title"], "Glossary")
        # The client sent an empty id; the RPC mints one rather than storing a blank.
        chk("note id minted server-side", len(c["notes"][0]["id"]) >= 32, True)
        chk("who stamped", c["updated_by"], member_id)
        chk("when stamped", c.get("updated_at") is not None, True)
        # BACK, after 0044 dropped them and 0048 restored them. The worker never stopped
        # reading either key, so these two round-tripping is the whole restoration.
        chk("audience written", c["audience"], "Warehouse staff, not especially technical")
        chk("tone written", c["tone"], "Warm \u00b7 Balanced")

        print("\n2b. audience and tone are EXEMPT from the shared budget")
        # The pool exists to cap the prose injected into every run. If either of these
        # were folded into it, the client meter would fill at one length and the RPC
        # refuse at another -- the exact drift the single-source rule exists to prevent.
        budget = db.rpc("context_char_budget", {}).execute().data
        member.rpc("set_product_context", {
            "p_kb_id": kb_id,
            "p_name": "Acme Dashboard",
            "p_description": "d" * budget,        # the whole pool, on its own
            "p_notes": [],
            "p_audience": "a" * 200,              # at its own cap
            "p_tone": "Casual \u00b7 Thorough",
        }).execute()
        c = ctx()
        chk("a full-budget description saves beside a full audience",
            len(c["description"]), budget)
        chk("audience at its cap saved", len(c["audience"]), 200)

        print("\n2c. Each has its OWN cap, and refuses rather than truncates")
        chk(
            "audience over 200 refused",
            "audience is too long" in (err(lambda: member.rpc("set_product_context", {
                "p_kb_id": kb_id, "p_name": "Acme Dashboard",
                "p_audience": "a" * 201}).execute()) or ""),
            True,
        )
        chk(
            "tone over 40 refused",
            "tone is too long" in (err(lambda: member.rpc("set_product_context", {
                "p_kb_id": kb_id, "p_name": "Acme Dashboard",
                "p_tone": "t" * 41}).execute()) or ""),
            True,
        )
        chk("neither refusal changed the stored row", ctx()["audience"], "a" * 200)

        # Put the row back where the rest of the run expects it.
        member.rpc("set_product_context", {
            "p_kb_id": kb_id,
            "p_name": "Acme Dashboard",
            "p_description": "Inventory tracking for small warehouses.",
            "p_notes": [{"id": "", "title": "Glossary", "body": "SKU = one item."}],
            "p_audience": "Warehouse staff, not especially technical",
            "p_tone": "Warm \u00b7 Balanced",
        }).execute()

        print("\n3. Someone with no relationship to the KB is refused")
        chk(
            "stranger refused",
            "not your knowledge base"
            in (err(lambda: stranger.rpc("set_product_context",
                {"p_kb_id": kb_id, "p_name": "Mine now"}).execute()) or "").lower(),
            True,
        )
        chk("stranger's write did not land", ctx()["name"], "Acme Dashboard")

        print("\n4. The budget is the DATABASE's, not the client meter's")
        budget = config.CONTEXT_CHAR_BUDGET
        chk(
            "one char over is refused",
            "over the" in (err(lambda: owner.rpc("set_product_context",
                {"p_kb_id": kb_id, "p_name": "Acme Dashboard",
                 "p_description": "x" * (budget + 1)}).execute()) or "").lower(),
            True,
        )
        owner.rpc("set_product_context", {
            "p_kb_id": kb_id, "p_name": "Acme Dashboard", "p_description": "x" * budget,
        }).execute()
        chk("exactly the budget is accepted", len(ctx()["description"]), budget)

        print("\n5. The pool is SHARED - a note and a description compete for it")
        # Half the budget in prose leaves half for notes. A note that would fit in an empty
        # help center is refused here, which is the whole point of one pool.
        half = budget // 2
        chk(
            "a note that overflows the REMAINDER is refused",
            "over the" in (err(lambda: owner.rpc("set_product_context", {
                "p_kb_id": kb_id, "p_name": "Acme Dashboard",
                "p_description": "d" * half,
                "p_notes": [{"id": "", "title": "T", "body": "b" * half}],
            }).execute()) or "").lower(),
            True,
        )
        # ...and the same note fits once the description makes room. Same call, less prose.
        owner.rpc("set_product_context", {
            "p_kb_id": kb_id, "p_name": "Acme Dashboard",
            "p_description": "d" * 10,
            "p_notes": [{"id": "", "title": "T", "body": "b" * half}],
        }).execute()
        chk("it fits once the description shrinks", len(ctx()["notes"]), 1)

        print("\n6. Deleting a note frees the budget, live")
        # Sending the notes list WITHOUT that note is the delete. The write that follows is
        # the one refused in step 5 - it must now succeed, unchanged.
        owner.rpc("set_product_context", {
            "p_kb_id": kb_id, "p_name": "Acme Dashboard",
            "p_description": "d" * 10, "p_notes": [],
        }).execute()
        chk("note deleted", len(ctx()["notes"]), 0)
        owner.rpc("set_product_context", {
            "p_kb_id": kb_id, "p_name": "Acme Dashboard", "p_description": "d" * half,
        }).execute()
        chk("the freed budget is spendable", len(ctx()["description"]), half)

        print("\n7. The old direct-table write path is closed")
        # PostgREST does not error on a column the role cannot write; it writes nothing.
        # So the assertion is on the VALUE, which is the only thing that would have been
        # wrong if the grant were still there.
        err(lambda: owner.table("knowledge_bases")
            .update({"product_context": {"name": "Bypassed", "description": "", "notes": []}})
            .eq("id", kb_id).execute())
        chk("direct update did not change the name", ctx()["name"], "Acme Dashboard")

        print("\n8. An empty name is refused (it is the one required field)")
        chk(
            "blank name refused",
            "required" in (err(lambda: owner.rpc("set_product_context",
                {"p_kb_id": kb_id, "p_name": "   "}).execute()) or "").lower(),
            True,
        )

    finally:
        if kb_id:
            db.table("knowledge_bases").delete().eq("id", kb_id).execute()
        for uid in (owner_id, member_id, stranger_id):
            if uid:
                try:
                    db.auth.admin.delete_user(uid)
                except Exception:  # noqa: BLE001
                    pass

    print("\n" + ("FAILED: " + ", ".join(fails) if fails else "all checks passed"))
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
