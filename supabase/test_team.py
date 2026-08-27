"""Live acceptance run for team access, against the real project.

Sibling of test_claim.py / test_trial.py: run it after touching kb_members, kb_invites,
can_edit_kb, the storage policies, or the quota attribution.

Everything a member is allowed or refused runs through the ANON key in a real signed-in
session, never through the service role — "a member cannot change the custom domain" is
only a real claim if it is checked from where the attack would come from. The four
refusals below were each a policy that LOOKED correct while the hole was live (§10e.2).

Throwaway accounts throughout; deleted at the end no matter what.

    cd supabase && ../worker/.venv/Scripts/python test_team.py
"""
import os, sys, time, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
os.chdir(os.path.join(ROOT, "worker"))

import config, pipeline

ANON = [l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, "web", ".env.local"))
        if l.startswith("VITE_SUPABASE_ANON_KEY")][0]

from supabase import create_client

db = pipeline.db()
anon = create_client(config.SUPABASE_URL, ANON)
fails = []


def chk(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok:
        fails.append(label)


def refused(label, fn):
    """Assert fn() raises, and print the error — the checklist wants the message, not a bool."""
    try:
        fn()
    except Exception as e:
        msg = str(e).replace("\n", " ")[:160]
        print(f"PASS  {label}   refused: {msg}")
        return
    print(f"FAIL  {label}   NOT refused")
    fails.append(label)


def make_user(tag):
    email = f"team-{tag}-{uuid.uuid4().hex[:8]}@example.com"
    pw = uuid.uuid4().hex + "Aa1!"
    u = db.auth.admin.create_user({"email": email, "password": pw, "email_confirm": True})
    time.sleep(0.8)  # handle_new_user() provisions the KB
    return u.user.id, email, pw


def signed_in(email, pw):
    c = create_client(config.SUPABASE_URL, ANON)
    c.auth.sign_in_with_password({"email": email, "password": pw})
    return c


def kb_of(uid):
    return db.table("knowledge_bases").select("*").eq("owner_id", uid).execute().data[0]


users = []
try:
    # O = the owner (paid). M = the teammate, on FREE — the point of L2/§4 is that their
    # own plan is irrelevant inside someone else's paid help center. S = a stranger.
    o_uid, o_email, o_pw = make_user("owner"); users.append(o_uid)
    m_uid, m_email, m_pw = make_user("member"); users.append(m_uid)
    s_uid, s_email, s_pw = make_user("stranger"); users.append(s_uid)
    db.table("profiles").update({"plan": "starter"}).eq("id", o_uid).execute()

    kb = kb_of(o_uid)
    kb_id = kb["id"]
    O, M, S = signed_in(o_email, o_pw), signed_in(m_email, m_pw), signed_in(s_email, s_pw)

    print(f"\n== owner {o_email[:24]} / member {m_email[:24]} — kb {kb_id[:8]} ==\n")

    # --- the free-plan gate is SERVER-side ------------------------------------------
    db.table("profiles").update({"plan": "free"}).eq("id", o_uid).execute()
    refused("free-plan owner cannot invite (direct rpc, not the UI)",
            lambda: O.rpc("invite_to_kb", {"p_kb_id": kb_id, "p_email": m_email}).execute())
    db.table("profiles").update({"plan": "starter"}).eq("id", o_uid).execute()

    # --- invite -> accept ------------------------------------------------------------
    token = O.rpc("invite_to_kb", {"p_kb_id": kb_id, "p_email": m_email.upper()}).execute().data
    row = db.table("kb_invites").select("email").eq("token", token).execute().data[0]
    chk("the address is normalised on write", row["email"], m_email.lower())

    pv = anon.rpc("invite_preview", {"p_token": token}).execute().data[0]
    chk("the preview is readable signed OUT", pv["state"], "valid")
    chk("...and withholds the kb id", "kb_id" in pv, False)

    refused("accepting with a mismatched JWT email",
            lambda: S.rpc("accept_kb_invite", {"p_token": token}).execute())

    chk("the member accepts", M.rpc("accept_kb_invite", {"p_token": token}).execute().data, kb_id)
    chk("kb_access_state for the member", M.rpc("kb_access_state", {"p_kb_id": kb_id}).execute().data, "ok")
    chk("kb_access_state for a stranger", S.rpc("kb_access_state", {"p_kb_id": kb_id}).execute().data, "none")

    # --- a free-plan ADMIN inside a paid KB can invite --------------------------------
    t2 = M.rpc("invite_to_kb", {"p_kb_id": kb_id, "p_email": s_email}).execute().data
    chk("a free-plan admin can invite (the OWNER's plan is the gate)", bool(t2), True)
    M.rpc("revoke_kb_invite", {"p_invite_id":
          db.table("kb_invites").select("id").eq("token", t2).execute().data[0]["id"]}).execute()
    chk("a revoked link dies immediately",
        anon.rpc("invite_preview", {"p_token": t2}).execute().data[0]["state"], "revoked")

    # --- what a member can DO --------------------------------------------------------
    art = M.table("articles").insert(
        {"kb_id": kb_id, "title": "Written by the member", "slug": f"m-{uuid.uuid4().hex[:6]}"}
    ).execute().data[0]
    chk("a member can create an article", art["title"], "Written by the member")
    M.table("steps").insert(
        {"article_id": art["id"], "step_number": 1, "heading": "One", "body_text": "x"}
    ).execute()
    chk("a member can add a step",
        len(M.table("steps").select("id").eq("article_id", art["id"]).execute().data), 1)
    M.table("articles").update({"visibility": "listed"}).eq("id", art["id"]).execute()
    chk("a member can publish",
        db.table("articles").select("visibility").eq("id", art["id"]).execute().data[0]["visibility"],
        "listed")
    M.table("folders").insert({"kb_id": kb_id, "name": "Member folder"}).execute()
    M.table("knowledge_bases").update({"headline": "Renamed by the member"}).eq("id", kb_id).execute()
    chk("a member can theme the help center",
        db.table("knowledge_bases").select("headline").eq("id", kb_id).execute().data[0]["headline"],
        "Renamed by the member")

    for bucket in ("frames", "videos", "branding"):
        M.storage.from_(bucket).upload(f"{kb_id}/team-test-{uuid.uuid4().hex[:6]}.txt", b"x")
        print(f"PASS  a member can upload to `{bucket}`")

    # --- what a member CANNOT do -----------------------------------------------------
    refused("a member cannot set custom_domain (direct, not through the UI)",
            lambda: M.table("knowledge_bases").update({"custom_domain": "evil.example.com"})
                     .eq("id", kb_id).execute())
    refused("...and neither can the OWNER from the client (column grant, service role only)",
            lambda: O.table("knowledge_bases").update({"custom_domain": "mine.example.com"})
                     .eq("id", kb_id).execute())
    refused("a client cannot reset its own trial clock",
            lambda: O.table("knowledge_bases").update({"trial_started_at": "2030-01-01T00:00:00Z"})
                     .eq("id", kb_id).execute())

    M.table("knowledge_bases").delete().eq("id", kb_id).execute()
    chk("a member cannot delete the help center",
        len(db.table("knowledge_bases").select("id").eq("id", kb_id).execute().data), 1)

    refused("the owner cannot be removed, by anyone",
            lambda: M.rpc("remove_kb_member", {"p_kb_id": kb_id, "p_user_id": o_uid}).execute())

    chk("a stranger sees nothing of the KB",
        len(S.table("articles").select("id").eq("kb_id", kb_id).execute().data), 0)

    # --- the People screen -----------------------------------------------------------
    people = M.rpc("kb_people", {"p_kb_id": kb_id}).execute().data
    chk("kb_people lists both, owner first",
        [(p["kind"], p["is_owner"]) for p in people], [("member", True), ("member", False)])
    chk("...without widening profiles: the member reads the owner's email",
        any(p["email"] == o_email for p in people), True)
    chk("a stranger gets nothing from kb_people",
        S.rpc("kb_people", {"p_kb_id": kb_id}).execute().data, [])

    # --- quota is billed to the OWNER ------------------------------------------------
    ent = lambda c: c.rpc("kb_entitlements", {"p_kb_id": kb_id}).execute().data[0]
    before = ent(M)["runs_used"]
    job = db.table("jobs").insert({
        "kb_id": kb_id, "user_id": m_uid, "billed_to_user_id": o_uid,
        "status": "done", "stage": "writing",
    }).execute().data[0]
    db.table("jobs").update({"counted_against_quota": True}).eq("id", job["id"]).execute()
    chk("a member's run moves the OWNER's meter", ent(M)["runs_used"], before + 1)
    # The whole point of kb_entitlements: a member gets the OWNER's cap, not their own, and
    # never the tier name.
    chk("...and the member reads the OWNER's limits, not their own",
        (ent(M)["lifetime_runs"], ent(M)["watermark"], ent(M)["can_invite"]), (None, False, True))
    chk("...with the plan name withheld from a non-owner",
        (ent(M)["plan"], ent(M)["is_owner"]), (None, False))
    chk("...and handed to the owner", (ent(O)["plan"], ent(O)["is_owner"]), ("starter", True))
    # The retention window is a LIMIT, not billing, so it goes to the member too — and it
    # is the OWNER's window (migration 0041). Reading the caller's own plan here would tell
    # a member inside a paid help center that we delete their recording in a week.
    chk("...and the source-video retention window is the OWNER's",
        (ent(M)["video_retention_days"], ent(O)["video_retention_days"]), (None, None))
    chk("a stranger gets no entitlements at all",
        S.rpc("kb_entitlements", {"p_kb_id": kb_id}).execute().data, [])
    chk("...and the member's own account is untouched",
        db.table("jobs").select("id", count="exact")
          .eq("billed_to_user_id", m_uid).eq("counted_against_quota", True).execute().count, 0)

    # --- remove -> re-invite -> accept produces ONE row -------------------------------
    O.rpc("remove_kb_member", {"p_kb_id": kb_id, "p_user_id": m_uid}).execute()
    chk("a removed member is refused", M.rpc("kb_access_state", {"p_kb_id": kb_id}).execute().data, "removed")
    chk("...and can no longer write",
        len(M.table("articles").select("id").eq("kb_id", kb_id).execute().data), 0)

    t3 = O.rpc("invite_to_kb", {"p_kb_id": kb_id, "p_email": m_email}).execute().data
    chk("re-invited and accepted", M.rpc("accept_kb_invite", {"p_token": t3}).execute().data, kb_id)
    chk("removal is soft, so a re-invite REACTIVATES rather than duplicating",
        db.table("kb_members").select("user_id", count="exact")
          .eq("kb_id", kb_id).eq("user_id", m_uid).execute().count, 1)

    # --- claim wipes membership, never the ledger ------------------------------------
    # TWO members and one live invite at the moment of the handover — a prospect must never
    # inherit a silent admin, and one that got missed would be invisible from their side.
    d_uid, d_email, d_pw = make_user("second"); users.append(d_uid)
    t4 = O.rpc("invite_to_kb", {"p_kb_id": kb_id, "p_email": d_email}).execute().data
    signed_in(d_email, d_pw).rpc("accept_kb_invite", {"p_token": t4}).execute()
    chk("two members before the claim",
        db.table("kb_members").select("user_id", count="exact")
          .eq("kb_id", kb_id).is_("removed_at", "null").execute().count, 2)
    live_invite = O.rpc("invite_to_kb", {"p_kb_id": kb_id, "p_email": "someone@example.com"}).execute().data
    jobs_before = db.table("jobs").select("id", count="exact").eq("kb_id", kb_id).execute().count
    link = db.rpc("create_claim_link", {"p_kb_id": kb_id}).execute().data
    claim_token = link.rsplit("/", 1)[-1]
    chk("the stranger claims it", S.rpc("claim_kb", {"p_token": claim_token}).execute().data, kb_id)
    chk("claim leaves ZERO members",
        db.table("kb_members").select("kb_id", count="exact").eq("kb_id", kb_id).execute().count, 0)
    chk("claim kills the live invite",
        anon.rpc("invite_preview", {"p_token": live_invite}).execute().data[0]["state"], "revoked")
    chk("claim leaves the run ledger alone",
        db.table("jobs").select("id", count="exact").eq("kb_id", kb_id).execute().count, jobs_before)
    chk("the previous member has no access after the handover",
        M.rpc("kb_access_state", {"p_kb_id": kb_id}).execute().data, "none")

finally:
    for uid in users:
        try:
            db.auth.admin.delete_user(uid)
        except Exception as e:
            print("cleanup:", e)

print("\n" + ("FAILED: " + ", ".join(fails) if fails else "team access self-check OK"))
sys.exit(1 if fails else 0)
