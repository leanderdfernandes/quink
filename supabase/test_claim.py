"""Live acceptance run for the claim/handover flow, against the real project.

Sibling of test_transfer.sh (which proves the RESET semantics of claim_kb) and
test_trial.py. This one covers the reachable surface added in 0023: the link generator, the
anonymous preview, the four states, the race, and the promise that a help center looks
identical before and after it changes hands.

Everything runs through the ANON key where a real visitor would use the anon key — the
preview has to work for someone who is not signed in, and "leaks nothing" is only a real
claim if it is checked from outside.

Throwaway accounts throughout; deleted at the end no matter what.

    cd supabase && ../worker/.venv/Scripts/python test_claim.py
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


def make_user():
    email = f"claim-test-{uuid.uuid4().hex[:8]}@example.com"
    pw = uuid.uuid4().hex + "Aa1!"
    u = db.auth.admin.create_user({"email": email, "password": pw, "email_confirm": True})
    time.sleep(0.7)  # handle_new_user() provisions the KB
    return u.user.id, email, pw


def signed_in(email, pw):
    c = create_client(config.SUPABASE_URL, ANON)
    c.auth.sign_in_with_password({"email": email, "password": pw})
    return c


def kb_of(uid):
    return db.table("knowledge_bases").select("*").eq("owner_id", uid).execute().data


def preview(token):
    d = anon.rpc("claim_preview", {"p_token": token}).execute().data
    return d[0] if d else None


users = []
try:
    # A = us (the demo builder, on `internal`). B = the recipient. C = a stranger.
    a_uid, a_email, a_pw = make_user(); users.append(a_uid)
    b_uid, b_email, b_pw = make_user(); users.append(b_uid)
    c_uid, c_email, c_pw = make_user(); users.append(c_uid)
    db.table("profiles").update({"plan": "internal", "is_admin": True}).eq("id", a_uid).execute()

    demo = kb_of(a_uid)[0]
    kb_id = demo["id"]
    db.table("knowledge_bases").update({"name": "Acme Help Center"}).eq("id", kb_id).execute()
    # Re-read: migration 0013 repoints the subdomain when the name changes, so anything
    # captured before the rename is stale.
    sub = db.table("knowledge_bases").select("subdomain").eq("id", kb_id).execute().data[0]["subdomain"]

    # Two listed articles + one draft: the preview count must be the PUBLIC number.
    for i, vis in enumerate(("listed", "listed", "draft")):
        db.table("articles").insert({
            "kb_id": kb_id, "title": f"Guide {i}", "status": "ready", "visibility": vis,
            "slug": f"guide-{i}", "published_content": {"title": "t", "subtitle": "", "steps": []},
        }).execute()

    print("\n== 1. create_claim_link ==")
    as_a = signed_in(a_email, a_pw)
    url = as_a.rpc("create_claim_link", {"p_kb_id": kb_id, "p_base": "https://quink.online"}).execute().data
    chk("returns a pasteable URL, not a bare uuid", url.startswith("https://quink.online/claim/"), True)
    token = url.rsplit("/", 1)[1]
    chk("token is a uuid", bool(uuid.UUID(token)), True)
    row = db.table("knowledge_bases").select("is_demo,claim_expires_at").eq("id", kb_id).execute().data[0]
    chk("marks the KB as a demo", row["is_demo"], True)
    # Tolerance, not `.days == 29`. The expiry is stamped from the DATABASE clock and
    # compared against THIS machine's, and the two differ by a fraction of a second — enough
    # to flip `timedelta.days` between 29 and 30 depending on which side of the boundary the
    # skew lands. That made a correct 30-day link fail at random. Assert what the test
    # actually means: thirty days, give or take a few minutes.
    _dt = __import__("datetime")
    _delta = (_dt.datetime.fromisoformat(row["claim_expires_at"])
              - _dt.datetime.now(_dt.timezone.utc)).total_seconds()
    chk("expires ~30 days out", abs(_delta - 30 * 86400) < 300, True)

    print("\n== 2. a stranger cannot mint a link for someone else's KB ==")
    as_c = signed_in(c_email, c_pw)
    try:
        as_c.rpc("create_claim_link", {"p_kb_id": kb_id}).execute()
        chk("non-owner refused", "allowed", "refused")
    except Exception as e:
        chk("non-owner refused", "not allowed" in str(e), True)

    print("\n== 3. anonymous preview ==")
    p = preview(token)
    chk("status", p["status"], "valid")
    chk("kb name", p["kb_name"], "Acme Help Center")
    chk("counts LISTED articles only", p["article_count"], 2)
    chk("subdomain", p["subdomain"], sub)
    chk("leaks nothing else", sorted(p.keys()),
        ["article_count", "kb_name", "status", "subdomain"])
    chk("invalid token is a clean not-found",
        preview(str(uuid.uuid4())), None)

    print("\n== 4. the help center looks IDENTICAL before and after ==")
    before = anon.rpc("reader_kb", {"p_key": sub}).execute().data[0]
    chk("demo on internal is watermarked (is_demo wins)", before["watermark"], True)

    print("\n== 5. claim ==")
    b_kb_before = kb_of(b_uid)
    chk("recipient starts with their own empty KB", len(b_kb_before), 1)
    as_b = signed_in(b_email, b_pw)
    claimed_id = as_b.rpc("claim_kb", {"p_token": token}).execute().data
    chk("returns the kb id", claimed_id, kb_id)

    after = anon.rpc("reader_kb", {"p_key": sub}).execute().data[0]
    chk("watermark UNCHANGED across the handover", after["watermark"], before["watermark"])
    chk("everything else unchanged",
        {k: v for k, v in after.items() if k != "watermark"},
        {k: v for k, v in before.items() if k != "watermark"})

    row = db.table("knowledge_bases").select("*").eq("id", kb_id).execute().data[0]
    chk("owner moved", row["owner_id"], b_uid)
    chk("no longer a demo", row["is_demo"], False)
    chk("claim token consumed", row["claim_token"], None)
    chk("consumed token recorded", row["claimed_token"], token)
    chk("fresh trial clock", bool(row["trial_started_at"]), True)
    chk("fresh nudge markers",
        [row[m] for m in ("trial_day14_email_sent_at", "trial_day7_email_sent_at",
                          "trial_offline_email_sent_at", "trial_purged_email_sent_at")],
        [None, None, None, None])
    chk("recipient's EMPTY auto-KB was binned",
        [k["id"] for k in kb_of(b_uid)], [kb_id])
    chk("articles came along",
        len(db.table("articles").select("id").eq("kb_id", kb_id).execute().data), 3)

    print("\n== 6. the four states after the fact ==")
    p = preview(token)
    chk("preview now says claimed", p["status"], "claimed")
    chk("...and still names the KB, so the screen can be specific", p["kb_name"], "Acme Help Center")

    print("\n== 7. re-clicking a used link ==")
    chk("OWNER re-click lands in the KB",
        as_b.rpc("claim_kb", {"p_token": token}).execute().data, kb_id)
    chk("stranger re-click reveals nothing",
        as_c.rpc("claim_kb", {"p_token": token}).execute().data, None)
    chk("original sender gets nothing either",
        as_a.rpc("claim_kb", {"p_token": token}).execute().data, None)
    chk("owner re-click changed no state",
        db.table("knowledge_bases").select("owner_id").eq("id", kb_id).execute().data[0]["owner_id"],
        b_uid)

    print("\n== 8. race: second clicker gets a STATE, not an error ==")
    kb2 = kb_of(a_uid)
    db.table("knowledge_bases").update({"name": "Race KB"}).eq("id", kb2[0]["id"]).execute() if kb2 else None
    # Give A a fresh KB to hand out.
    fresh = db.table("knowledge_bases").insert({"owner_id": a_uid, "name": "Race KB"}).execute().data[0]
    url2 = as_a.rpc("create_claim_link", {"p_kb_id": fresh["id"]}).execute().data
    tok2 = url2.rsplit("/", 1)[1]
    first = as_c.rpc("claim_kb", {"p_token": tok2}).execute().data
    second = as_b.rpc("claim_kb", {"p_token": tok2}).execute().data
    chk("first clicker wins", first, fresh["id"])
    chk("second clicker gets null, not an exception", second, None)
    chk("loser sees 'claimed'", preview(tok2)["status"], "claimed")

    print("\n== 9. a non-empty KB is kept, not binned ==")
    # C now owns Race KB plus their own auto-KB — but theirs had no articles, so it went.
    # Re-check the other direction: give B content, then claim a third KB into B.
    third = db.table("knowledge_bases").insert({"owner_id": a_uid, "name": "Third KB"}).execute().data[0]
    db.table("articles").insert({"kb_id": kb_id, "title": "B's own work", "status": "ready"}).execute()
    tok3 = as_a.rpc("create_claim_link", {"p_kb_id": third["id"]}).execute().data.rsplit("/", 1)[1]
    as_b.rpc("claim_kb", {"p_token": tok3}).execute()
    chk("B keeps BOTH — a KB with articles is never deleted",
        sorted(k["id"] for k in kb_of(b_uid)), sorted([kb_id, third["id"]]))

    print("\n== 10. expired ==")
    db.table("knowledge_bases").update(
        {"claim_token": str(uuid.uuid4()), "claim_expires_at": "2020-01-01T00:00:00+00:00",
         "claimed_token": None}
    ).eq("id", fresh["id"]).execute()
    exp = db.table("knowledge_bases").select("claim_token").eq("id", fresh["id"]).execute().data[0]["claim_token"]
    chk("preview says expired", preview(exp)["status"], "expired")
    chk("claiming an expired token is refused",
        as_b.rpc("claim_kb", {"p_token": exp}).execute().data, None)

finally:
    for u in users:
        try:
            db.auth.admin.delete_user(u)
        except Exception as e:
            print("cleanup warning:", e)
    print("\n== cleaned up ==")

print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
