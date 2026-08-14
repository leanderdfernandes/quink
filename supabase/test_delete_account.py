"""Live acceptance run for self-serve account deletion, end to end against the real project.

Sibling of test_trial.py / test_claim.py / test_reader_ping.py. Run it after touching
purge.py, the trial sweep's purge, the jobs FKs, or anything that deletes.

Uses a THROWAWAY account with two KBs, real Storage objects in all three buckets, and real
`jobs` ledger rows. Everything it creates is torn down in `finally`, including on failure.

Five things need proving live, and a fake cannot prove any of them:

  * Storage is really empty afterwards — including `frames`, which is nested three deep and
    which the previous purge silently never touched;
  * one `auth.users` delete really does cascade profiles -> KBs -> articles -> steps ->
    folders, so the deletion does not depend on a hand-written table list that can go stale;
  * the `jobs` ledger really survives with nulled identifiers and intact `est_cost_usd` —
    §10b, the spend history is ours and the breaker reads it;
  * a Vercel failure at the detach step really leaves the account completely intact;
  * the endpoint really derives the account from the JWT, so a body naming someone else
    deletes the caller.

    cd supabase && ../worker/.venv/Scripts/python test_delete_account.py
"""
import os, sys, time, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
os.chdir(os.path.join(ROOT, "worker"))

import config

# Stub hosting: this test must not touch the real Vercel project. The stub implements the
# same Hosting protocol, so the detach + read-back in delete_account runs for real.
config.DOMAIN_VERIFIER = "stub"
config.ALLOWED_ORIGINS = ["http://localhost:5173"]

import domain, pipeline, purge  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from supabase import create_client  # noqa: E402

ANON = [l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, "web", ".env.local"))
        if l.startswith("VITE_SUPABASE_ANON_KEY")][0]

db = pipeline.db()
fails = []
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


def chk(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok:
        fails.append(label)


def count(table, col, val):
    r = db.table(table).select("id", count="exact").eq(col, val).limit(1).execute()
    return r.count or 0


def objects(bucket, kb_id):
    """Every real object under this KB's prefix — the same recursive walk purge uses."""
    return purge._object_paths(bucket, kb_id)


def seed_storage(kb_id):
    art = str(uuid.uuid4())
    # NESTED, exactly as the pipeline writes them. This is the shape the old purge missed:
    # list("{kb_id}") returns the article folder, and remove() on a folder deletes nothing.
    db.storage.from_(config.BUCKET_FRAMES).upload(f"{kb_id}/{art}/step-1.webp", PNG)
    db.storage.from_(config.BUCKET_FRAMES).upload(f"{kb_id}/{art}/dense/00001.webp", PNG)
    db.storage.from_(config.BUCKET_VIDEOS).upload(f"{kb_id}/{uuid.uuid4()}.mp4", PNG)
    db.storage.from_(config.BUCKET_BRANDING).upload(f"{kb_id}/logo-{uuid.uuid4()}.png", PNG)


def make_account(plan="free", is_admin=False, domain_on_second=True):
    """A throwaway account with two KBs, storage in all three buckets, articles and jobs."""
    email = f"del-test-{uuid.uuid4().hex[:8]}@example.com"
    password = uuid.uuid4().hex + "Aa1!"
    user = db.auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True}
    )
    uid = user.user.id
    time.sleep(1)  # let handle_new_user() provision the first KB
    db.table("profiles").update({"plan": plan, "is_admin": is_admin}).eq("id", uid).execute()

    kb1 = db.table("knowledge_bases").select("id").eq("owner_id", uid).execute().data[0]["id"]
    kb2 = (
        db.table("knowledge_bases")
        .insert({"owner_id": uid, "name": f"Second {uuid.uuid4().hex[:6]}"})
        .execute()
    ).data[0]["id"]

    custom = None
    if domain_on_second:
        custom = f"help-{uuid.uuid4().hex[:8]}.example.com"
        db.table("knowledge_bases").update(
            {"custom_domain": custom, "domain_status": "live"}
        ).eq("id", kb2).execute()
        domain.stub().set(custom, True)  # the stub now reports it as attached

    art_ids = []
    for kb in (kb1, kb2):
        seed_storage(kb)
        f = db.table("folders").insert({"kb_id": kb, "name": "Guides"}).execute().data[0]["id"]
        a = (
            db.table("articles")
            .insert({"kb_id": kb, "title": "Test article", "folder_id": f})
            .execute()
        ).data[0]["id"]
        art_ids.append(a)
        db.table("steps").insert(
            {"article_id": a, "step_number": 1, "heading": "H", "body_text": "B"}
        ).execute()
        # A finished, quota-counting run with real cost history and free text to scrub.
        db.table("jobs").insert({
            "user_id": uid, "kb_id": kb, "article_id": a,
            "stage": "writing", "status": "done", "counted_against_quota": True,
            "est_cost_usd": 0.04, "failure_detail": "raw model output, log-only",
            "context": {"product_name": "Acme", "audience": "New users"},
            "video_path": f"{kb}/{uuid.uuid4()}.mp4",
        }).execute()

    return {"uid": uid, "email": email, "password": password,
            "kbs": [kb1, kb2], "articles": art_ids, "custom": custom}


def teardown(acct):
    try:
        db.auth.admin.delete_user(acct["uid"])
    except Exception:
        pass
    for kb in acct["kbs"]:
        try:
            purge.purge_kb_storage(kb)
        except Exception:
            pass
    try:
        db.table("jobs").delete().is_("user_id", "null").is_("kb_id", "null").eq(
            "est_cost_usd", 0.04
        ).execute()
    except Exception:
        pass


# =========================================================================================
print("\n== 1. refusals: nothing may be destroyed ==\n")
for label, kw in (("paid plan", {"plan": "starter"}), ("admin", {"is_admin": True})):
    acct = make_account(**kw)
    try:
        try:
            purge.delete_account(acct["uid"])
            chk(f"{label} is refused", "not refused", "refused")
        except purge.Refused as e:
            chk(f"{label} is refused", True, True)
            print(f"        -> {e}")
        # The whole point of refusing: NOTHING went.
        chk(f"{label}: kbs intact", count("knowledge_bases", "owner_id", acct["uid"]), 2)
        chk(f"{label}: articles intact", count("articles", "kb_id", acct["kbs"][0]), 1)
        chk(f"{label}: storage intact",
            len(objects(config.BUCKET_FRAMES, acct["kbs"][0])), 2)
        chk(f"{label}: user intact",
            db.auth.admin.get_user_by_id(acct["uid"]).user.id, acct["uid"])
    finally:
        teardown(acct)

# --- mid-generation ----------------------------------------------------------------------
acct = make_account()
try:
    db.table("jobs").insert({
        "user_id": acct["uid"], "kb_id": acct["kbs"][0],
        "stage": "analyzing", "status": "running", "est_cost_usd": 0.04,
    }).execute()
    try:
        purge.delete_account(acct["uid"])
        chk("mid-generation is refused", "not refused", "refused")
    except purge.Refused as e:
        chk("mid-generation is refused", True, True)
        print(f"        -> {e}")
    chk("mid-generation: kbs intact", count("knowledge_bases", "owner_id", acct["uid"]), 2)
finally:
    teardown(acct)

# =========================================================================================
print("\n== 2. a hosting failure aborts everything ==\n")
acct = make_account()
try:
    class _Broken:
        def attach(self, d): raise RuntimeError("vercel down")
        def detach(self, d): raise RuntimeError("vercel down")
        def servable(self, d): return True

    real_hosting = domain.hosting
    domain.hosting = lambda: _Broken()
    try:
        purge.delete_account(acct["uid"])
        chk("vercel failure aborts", "deleted", "refused")
    except purge.Refused as e:
        chk("vercel failure aborts", True, True)
        print(f"        -> {e}")
    finally:
        domain.hosting = real_hosting

    # "Nothing has been destroyed yet, so aborting is free" — prove it, every layer.
    chk("abort: kbs intact", count("knowledge_bases", "owner_id", acct["uid"]), 2)
    chk("abort: articles intact", count("articles", "kb_id", acct["kbs"][1]), 1)
    chk("abort: frames intact", len(objects(config.BUCKET_FRAMES, acct["kbs"][1])), 2)
    chk("abort: videos intact", len(objects(config.BUCKET_VIDEOS, acct["kbs"][1])), 1)
    chk("abort: user can still sign in",
        bool(create_client(config.SUPABASE_URL, ANON).auth.sign_in_with_password(
            {"email": acct["email"], "password": acct["password"]}).session), True)
    job = db.table("jobs").select("failure_detail").eq("user_id", acct["uid"]).limit(1).execute()
    chk("abort: jobs not scrubbed", job.data[0]["failure_detail"] is not None, True)
finally:
    teardown(acct)

# =========================================================================================
print("\n== 3. the full run, over HTTP, with someone else's id in the body ==\n")
victim = make_account(domain_on_second=False)
acct = make_account()
try:
    kb1, kb2 = acct["kbs"]
    before_frames = len(objects(config.BUCKET_FRAMES, kb1))
    chk("seeded nested frames", before_frames, 2)

    as_user = create_client(config.SUPABASE_URL, ANON)
    token = as_user.auth.sign_in_with_password(
        {"email": acct["email"], "password": acct["password"]}
    ).session.access_token

    import main
    import mailer

    # ORDERING SPY. The email now goes out AFTER auth.users is deleted, and a log line
    # cannot prove ordering on its own — so the spy asks, at the instant of the send,
    # whether the account still exists. If the send ever drifts back before the delete,
    # `user_gone_at_send` flips to False and this test fails.
    #
    # EMAIL_ENABLED is off (the default, and the only safe setting for a test that creates
    # real accounts), so the real send_once logs the payload instead of mailing anyone.
    sends: list[dict] = []
    real_send = mailer.send_once

    def spy_send(to, subject, body, **kw):
        try:
            db.auth.admin.get_user_by_id(acct["uid"])
            gone = False
        except Exception:
            gone = True
        sends.append({"to": to, "subject": subject, "body": body,
                      "kw": kw, "user_gone_at_send": gone})
        return real_send(to, subject, body, **kw)

    mailer.send_once = spy_send

    # No `with`: the lifespan would start the background domain loop, which this test has no
    # use for and which would sweep against the live project for the length of the run.
    client = TestClient(main.app)
    try:
        r = client.post(
            "/api/account/delete",
            headers={"Authorization": f"Bearer {token}"},
            # §10e.1: the endpoint has NO body parameter, so this is ignored outright. The
            # account that gets deleted is the one that owns the token.
            json={"user_id": victim["uid"], "uid": victim["uid"]},
        )
    finally:
        mailer.send_once = real_send
    chk("endpoint returns 200", r.status_code, 200)

    # --- the confirmation email, and WHEN it fires ---------------------------------------
    chk("confirmation email fired once", len(sends), 1)
    mail = sends[0] if sends else {"to": "", "subject": "", "body": "", "kw": {}}
    chk("addressed to the account", mail["to"], acct["email"])
    chk("subject is the receipt", mail["subject"], "Your Quink account has been deleted")
    # THE ORDERING FIX: the account is already gone by the time we say it is gone.
    chk("SENT AFTER auth.users was deleted", mail.get("user_gone_at_send"), True)
    # ...which is also why it cannot carry a marker: there is no row left to claim one on.
    chk("no marker (no row survives to mark)", mail["kw"].get("marker"), None)
    chk("no table/row_id passed",
        (mail["kw"].get("table"), mail["kw"].get("row_id")), (None, None))
    # It has to be a receipt, not a notice: the permanence line is the same sentence the
    # dialog showed before the button was pressed.
    chk("says there is no backup", "no backup to restore from" in mail["body"], True)
    chk("reported kb count", r.json().get("knowledge_bases"), 2)
    chk("reported article count", r.json().get("articles"), 2)

    # --- the victim named in the body is untouched ---------------------------------------
    chk("BODY IGNORED: victim's kbs intact",
        count("knowledge_bases", "owner_id", victim["uid"]), 2)
    chk("BODY IGNORED: victim still exists",
        db.auth.admin.get_user_by_id(victim["uid"]).user.id, victim["uid"])

    # --- storage, all three buckets, both KBs --------------------------------------------
    for kb in (kb1, kb2):
        for bucket in config.KB_BUCKETS:
            chk(f"{bucket}/{kb[:8]} empty", len(objects(bucket, kb)), 0)

    # --- rows ----------------------------------------------------------------------------
    chk("no knowledge_bases", count("knowledge_bases", "owner_id", acct["uid"]), 0)
    chk("no articles", count("articles", "kb_id", kb1) + count("articles", "kb_id", kb2), 0)
    chk("no folders", count("folders", "kb_id", kb1) + count("folders", "kb_id", kb2), 0)
    steps = db.table("steps").select("id", count="exact").in_(
        "article_id", acct["articles"]).limit(1).execute()
    chk("no steps", steps.count or 0, 0)
    prof = db.table("profiles").select("id").eq("id", acct["uid"]).execute()
    chk("no profile", prof.data, [])

    # --- auth ----------------------------------------------------------------------------
    gone = False
    try:
        db.auth.admin.get_user_by_id(acct["uid"])
    except Exception:
        gone = True
    chk("user removed from auth.users", gone, True)
    signed_in = True
    try:
        create_client(config.SUPABASE_URL, ANON).auth.sign_in_with_password(
            {"email": acct["email"], "password": acct["password"]})
    except Exception:
        signed_in = False
    chk("cannot sign in", signed_in, False)

    # --- the ledger SURVIVES, anonymised (§10b) -------------------------------------------
    ledger = db.table("jobs").select("*").is_("user_id", "null").eq(
        "est_cost_usd", 0.04).execute().data
    mine = [j for j in ledger if j["kb_id"] is None and j["article_id"] is None]
    chk("jobs rows survive", len(mine) >= 2, True)
    chk("est_cost_usd intact", all(float(j["est_cost_usd"]) == 0.04 for j in mine), True)
    chk("counted_against_quota intact", any(j["counted_against_quota"] for j in mine), True)
    chk("failure_detail scrubbed", all(j["failure_detail"] is None for j in mine), True)
    chk("context scrubbed", all(not j["context"] for j in mine), True)
    chk("created_at kept", all(j["created_at"] for j in mine), True)

    # --- the custom domain is released ---------------------------------------------------
    chk("domain released from hosting", domain.hosting().servable(acct["custom"]), False)

    # --- a second call fails cleanly, not with a 500 -------------------------------------
    r2 = client.post("/api/account/delete", headers={"Authorization": f"Bearer {token}"})
    chk("second call is a clean 401", r2.status_code, 401)
    chk("second call is not a 500", r2.status_code < 500, True)
finally:
    teardown(acct)
    teardown(victim)

# =========================================================================================
print("\n== 4. a failed confirmation alerts, and rolls nothing back ==\n")
# The send is now the LAST step and cannot be retried — the account it concerns is already
# gone, so nothing in the database will ever again know the address existed. The ops alert
# is therefore the only surviving record. What must NOT happen is the deletion unwinding:
# the user asked for this and it succeeded.
acct = make_account(domain_on_second=False)
try:
    import mailer

    real_send, real_notify = mailer.send_once, purge.notify_ops
    alerts: list[str] = []
    mailer.send_once = lambda *a, **kw: False  # provider refused
    purge.notify_ops = lambda text: alerts.append(text) or True
    try:
        result = purge.delete_account(acct["uid"])
    finally:
        mailer.send_once, purge.notify_ops = real_send, real_notify

    chk("deletion still reports success", result.get("deleted"), True)
    failure_alerts = [a for a in alerts if "DELETION CONFIRMATION FAILED" in a]
    chk("an alert names the failure", len(failure_alerts), 1)
    chk("the alert carries the address",
        acct["email"] in (failure_alerts[0] if failure_alerts else ""), True)
    chk("the alert says the account is gone",
        "The account is gone" in (failure_alerts[0] if failure_alerts else ""), True)

    # NOTHING ROLLED BACK — the send failing must not resurrect the account.
    chk("rollback: user still deleted",
        db.table("profiles").select("id").eq("id", acct["uid"]).execute().data, [])
    chk("rollback: kbs still deleted", count("knowledge_bases", "owner_id", acct["uid"]), 0)
    chk("rollback: storage still empty",
        sum(len(objects(b, acct["kbs"][0])) for b in config.KB_BUCKETS), 0)
finally:
    teardown(acct)

print(f"\n{'ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
