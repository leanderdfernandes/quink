"""Live acceptance run for the free-trial lifecycle, end to end against the real project.

Sibling of test_transfer.sh: run it after touching anything lifecycle-shaped — the sweep,
the reader gate, claim_kb, admin_set_plan, or the jobs FKs.

worker/trial.py's own demo() covers the selection logic with fakes. This exists for the four
things a fake cannot prove, each of which has already been a real bug class here:

  * the PostgREST `profiles!inner` embed filter genuinely restricts to free-plan KBs (if it
    ever silently stopped filtering, the sweep would delete live reverse demos);
  * the reader is dark through the ANON key, including by kb_id, not just by hostname;
  * `jobs.kb_id on delete set null` really does keep the run ledger after a purge;
  * `admin_set_plan` really refuses both a service-role caller (no auth.uid()) and a
    signed-in non-admin.

Moves trial_started_at BACKWARDS rather than waiting. Uses a throwaway account, so nothing
real is touched, and deletes it at the end no matter what.

    cd supabase && ../worker/.venv/Scripts/python test_trial.py
"""
import os, sys, time, uuid
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
os.chdir(os.path.join(ROOT, "worker"))

import config, pipeline, trial, mailer

ANON = [l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, "web", ".env.local"))
        if l.startswith("VITE_SUPABASE_ANON_KEY")][0]

db = pipeline.db()
now = lambda: datetime.now(timezone.utc)
fails = []

def chk(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok:
        fails.append(label)

def set_started(kb_id, days_ago, **extra):
    db.table("knowledge_bases").update(
        {"trial_started_at": (now() - timedelta(days=days_ago)).isoformat(), **extra}
    ).eq("id", kb_id).execute()

def kbrow(kb_id):
    r = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
    return r.data[0] if r.data else None

# --- throwaway account -----------------------------------------------------------
email = f"trial-test-{uuid.uuid4().hex[:8]}@example.com"
password = uuid.uuid4().hex + "Aa1!"
user = db.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
uid = user.user.id
print(f"\n== throwaway account {email} ({uid[:8]}) ==\n")

try:
    time.sleep(1)  # let handle_new_user() land
    kbs = db.table("knowledge_bases").select("id,name").eq("owner_id", uid).execute().data
    kb_id = kbs[0]["id"]
    chk("auto-provisioned KB", len(kbs), 1)
    chk("default plan is free",
        db.table("profiles").select("plan").eq("id", uid).execute().data[0]["plan"], "free")

    # An article starts the clock (trigger) and gives the emails a count to quote.
    art = db.table("articles").insert(
        {"kb_id": kb_id, "title": "How to do the thing", "status": "ready",
         "visibility": "listed", "slug": "how-to", "published_content": {"title": "t", "subtitle": "", "steps": []},
         "published_at": now().isoformat()}
    ).execute().data[0]
    chk("trial clock stamped by trigger", bool(kbrow(kb_id)["trial_started_at"]), True)

    # A ledger row, to prove the purge doesn't erase quota.
    job = db.table("jobs").insert(
        {"kb_id": kb_id, "user_id": uid, "article_id": art["id"], "status": "done",
         "counted_against_quota": True}
    ).execute().data[0]

    def articles_visibility():
        return [a["visibility"] for a in
                db.table("articles").select("visibility").eq("kb_id", kb_id).execute().data]

    baseline_vis = articles_visibility()

    # --- 20 days left: nothing -----------------------------------------------------
    set_started(kb_id, 10)
    chk("day 20 — no action", trial.sweep(), 0)
    chk("day 20 — no day-14 marker", kbrow(kb_id)["trial_day14_email_sent_at"], None)

    # --- 14 days left: exactly one day-14 email ------------------------------------
    set_started(kb_id, 16)
    chk("day 14 — acted", trial.sweep(), 1)
    chk("day 14 — marker set", bool(kbrow(kb_id)["trial_day14_email_sent_at"]), True)
    chk("day 14 — day-7 untouched", kbrow(kb_id)["trial_day7_email_sent_at"], None)
    chk("day 14 — second tick is silent", trial.sweep(), 0)

    # --- 7 days left ---------------------------------------------------------------
    set_started(kb_id, 23)
    chk("day 7 — acted", trial.sweep(), 1)
    chk("day 7 — marker set", bool(kbrow(kb_id)["trial_day7_email_sent_at"]), True)
    chk("day 7 — second tick is silent", trial.sweep(), 0)

    # --- worker was down across thresholds: only the most urgent sends -------------
    db.table("knowledge_bases").update(
        {"trial_day14_email_sent_at": None, "trial_day7_email_sent_at": None}
    ).eq("id", kb_id).execute()
    set_started(kb_id, 25)          # 5 days left: day-14 AND day-7 both due
    chk("catch-up — one action only", trial.sweep(), 1)
    row = kbrow(kb_id)
    chk("catch-up — skipped day-14 marked anyway", bool(row["trial_day14_email_sent_at"]), True)
    chk("catch-up — day-7 marked", bool(row["trial_day7_email_sent_at"]), True)

    # --- expiry: offline, and NOT a deletion ---------------------------------------
    set_started(kb_id, 31)
    chk("expiry — acted", trial.sweep(), 1)
    row = kbrow(kb_id)
    chk("expiry — offline_at set", bool(row["offline_at"]), True)
    chk("expiry — purge_at is +7d",
        round((datetime.fromisoformat(row["purge_at"]) - datetime.fromisoformat(row["offline_at"])).days), 7)
    chk("expiry — article visibility UNCHANGED", articles_visibility(), baseline_vis)
    chk("expiry — articles still exist",
        len(db.table("articles").select("id").eq("kb_id", kb_id).execute().data), 1)

    # --- the reader must be dark, via the anon key ---------------------------------
    from supabase import create_client
    anon = create_client(config.SUPABASE_URL, ANON)
    sub = row["subdomain"]
    chk("reader — resolver returns nothing", anon.rpc("reader_kb", {"p_key": sub}).execute().data, [])
    chk("reader — articles by kb_id blocked",
        anon.rpc("reader_articles", {"p_kb_id": kb_id}).execute().data, [])
    chk("reader — article by slug blocked",
        anon.rpc("reader_article", {"p_kb_id": kb_id, "p_slug": "how-to"}).execute().data, [])
    chk("reader — search blocked",
        anon.rpc("reader_search", {"p_kb_id": kb_id, "p_query": "thing"}).execute().data, [])

    # --- inside the grace window: untouched ----------------------------------------
    chk("grace — nothing happens yet", trial.sweep(), 0)
    chk("grace — KB still exists", bool(kbrow(kb_id)), True)

    # --- restore via admin_set_plan -------------------------------------------------
    # Deliberately NOT through the service-role client: admin_set_plan derives the actor
    # from auth.uid(), so a service-role call has no identity and is refused. That refusal
    # is the invariant (§10e.1) working, so the test proves it before proving the restore.
    try:
        db.rpc("admin_set_plan", {"p_target": uid, "p_plan": "starter"}).execute()
        chk("admin_set_plan — refuses a caller with no auth.uid()", "allowed", "refused")
    except Exception as e:
        chk("admin_set_plan — refuses a caller with no auth.uid()",
            "not permitted" in str(e), True)

    as_user = create_client(config.SUPABASE_URL, ANON)
    as_user.auth.sign_in_with_password({"email": email, "password": password})
    try:
        as_user.rpc("admin_set_plan", {"p_target": uid, "p_plan": "internal"}).execute()
        chk("admin_set_plan — refuses a NON-admin signed-in user", "allowed", "refused")
    except Exception as e:
        chk("admin_set_plan — refuses a NON-admin signed-in user",
            "not permitted" in str(e), True)

    db.table("profiles").update({"is_admin": True}).eq("id", uid).execute()
    as_user.rpc("admin_set_plan", {"p_target": uid, "p_plan": "starter"}).execute()
    row = kbrow(kb_id)
    chk("restore — offline_at cleared", row["offline_at"], None)
    chk("restore — purge_at cleared", row["purge_at"], None)
    chk("restore — clock cleared", row["trial_started_at"], None)
    chk("restore — all markers cleared",
        [row[m] for m in trial.MARKERS], [None, None, None, None])
    chk("restore — reader live again",
        len(anon.rpc("reader_kb", {"p_key": sub}).execute().data), 1)
    chk("restore — paid KB is invisible to the sweep", trial.sweep(), 0)

    # --- downgrade must not be an instant deletion ----------------------------------
    as_user.rpc("admin_set_plan", {"p_target": uid, "p_plan": "free"}).execute()
    row = kbrow(kb_id)
    started = datetime.fromisoformat(row["trial_started_at"])
    chk("downgrade — clock RESTARTS from now", (now() - started).total_seconds() < 60, True)
    chk("downgrade — no instant offline", trial.sweep(), 0)

    # --- purge -----------------------------------------------------------------------
    set_started(kb_id, 40, offline_at=(now() - timedelta(days=8)).isoformat(),
                purge_at=(now() - timedelta(days=1)).isoformat())
    chk("purge — acted", trial.sweep(), 1)
    chk("purge — KB gone", kbrow(kb_id), None)
    chk("purge — articles gone",
        db.table("articles").select("id").eq("kb_id", kb_id).execute().data, [])
    ledger = db.table("jobs").select("id,kb_id,counted_against_quota").eq("id", job["id"]).execute().data
    chk("purge — LEDGER ROW SURVIVES", len(ledger), 1)
    chk("purge — ledger still counts against quota", ledger[0]["counted_against_quota"], True)
    chk("purge — ledger no longer names the KB", ledger[0]["kb_id"], None)

finally:
    db.auth.admin.delete_user(uid)
    print(f"\n== cleaned up {email} ==")

print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
