"""Live acceptance run for product context as a guarded write (migration 0040).

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
  * a 601-character description is refused BY THE DATABASE, not merely by the input's
    maxLength — and the direct table update that used to be the write path now writes
    nothing at all.

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
            .select("product_name, product_context_updated_at")
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

        print("\n2. A member with can_edit_kb() can write it")
        member.rpc(
            "set_product_context",
            {
                "p_kb_id": kb_id,
                "p_name": "Acme Dashboard",
                "p_description": "Inventory tracking for small warehouses.",
                "p_audience": "New users",
                "p_tone": "Friendly",
            },
        ).execute()
        row = (
            owner.table("knowledge_bases")
            .select("product_name, product_description, audience, tone, "
                    "product_context_updated_at, product_context_updated_by")
            .eq("id", kb_id)
            .single()
            .execute()
            .data
        )
        chk("name written", row["product_name"], "Acme Dashboard")
        chk("audience written", row["audience"], "New users")
        chk("who stamped", row["product_context_updated_by"], member_id)
        chk("when stamped", row["product_context_updated_at"] is not None, True)

        print("\n3. Someone with no relationship to the KB is refused")
        chk(
            "stranger refused",
            "not your knowledge base"
            in (err(lambda: stranger.rpc("set_product_context",
                {"p_kb_id": kb_id, "p_name": "Mine now"}).execute()) or "").lower(),
            True,
        )
        chk(
            "stranger's write did not land",
            owner.table("knowledge_bases").select("product_name").eq("id", kb_id)
            .single().execute().data["product_name"],
            "Acme Dashboard",
        )

        print("\n4. The 600 cap is the DATABASE's, not the input's")
        long_desc = "x" * 601
        chk(
            "601 chars refused",
            "over 600" in (err(lambda: owner.rpc("set_product_context",
                {"p_kb_id": kb_id, "p_name": "Acme Dashboard",
                 "p_description": long_desc}).execute()) or "").lower(),
            True,
        )
        owner.rpc(
            "set_product_context",
            {"p_kb_id": kb_id, "p_name": "Acme Dashboard", "p_description": "x" * 600},
        ).execute()
        chk(
            "600 chars accepted",
            len(owner.table("knowledge_bases").select("product_description").eq("id", kb_id)
                .single().execute().data["product_description"]),
            600,
        )

        print("\n5. The old direct-table write path is closed")
        # PostgREST does not error on a column the role cannot write; it writes nothing.
        # So the assertion is on the VALUE, which is the only thing that would have been
        # wrong if the grant were still there.
        err(lambda: owner.table("knowledge_bases")
            .update({"product_name": "Bypassed", "product_description": long_desc})
            .eq("id", kb_id).execute())
        chk(
            "direct update did not change the name",
            owner.table("knowledge_bases").select("product_name").eq("id", kb_id)
            .single().execute().data["product_name"],
            "Acme Dashboard",
        )

        print("\n6. An empty name is refused (it is the one required field)")
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
