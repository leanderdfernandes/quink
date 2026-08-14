"""Live acceptance run for reader view counting (migration 0031), against the real project.

Sibling of test_trial.py / test_claim.py: run it after touching reader_ping, the reader
visibility gate, or anything that writes knowledge_bases.reader_views.

reader_ping is a SECURITY DEFINER function callable by ANON with a client-supplied kb_id,
so its WHERE clause is the entire security model. Four things need proving live, and none
of them can be proved by reading the SQL (§10e.2 — the profiles.plan hole looked correct
on the page while it was wide open):

  * the one-hour debounce really caps the counter, so hammering the endpoint cannot inflate
    a KB past 24/day;
  * an OFFLINE help center cannot be pinged — the same gate the three content RPCs use;
  * a random uuid is a silent no-op: no error, no row, and nothing echoed back that would
    tell an anonymous caller whether the id exists;
  * anon can EXECUTE it through PostgREST and still cannot UPDATE knowledge_bases directly.

Mutates one real KB's two counter columns and restores them at the end, no matter what.

    cd supabase && ../worker/.venv/Scripts/python test_reader_ping.py
"""
import os, sys, uuid
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
os.chdir(os.path.join(ROOT, "worker"))

import config, pipeline
from supabase import create_client

ANON = [l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, "web", ".env.local"))
        if l.startswith("VITE_SUPABASE_ANON_KEY")][0]

db = pipeline.db()
anon = create_client(config.SUPABASE_URL, ANON)
now = lambda: datetime.now(timezone.utc)
fails = []


def chk(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok:
        fails.append(label)


def kbrow(kb_id):
    r = db.table("knowledge_bases").select(
        "reader_views, last_reader_view_at, offline_at").eq("id", kb_id).execute()
    return r.data[0]


def reset(kb_id, **extra):
    db.table("knowledge_bases").update(
        {"reader_views": 0, "last_reader_view_at": None, **extra}).eq("id", kb_id).execute()


# Any KB will do — this exercises the gate, not a particular help center. Restored below.
kb_id = db.table("knowledge_bases").select("id, name").limit(1).execute().data[0]
kb_id, kb_name = kb_id["id"], kb_id["name"]
before = kbrow(kb_id)
print(f"\n== subject: {kb_name} ({kb_id[:8]}) ==\n")

try:
    # --- 1. the debounce is real -------------------------------------------------
    reset(kb_id)
    for _ in range(5):
        anon.rpc("reader_ping", {"p_kb_id": kb_id}).execute()
    row = kbrow(kb_id)
    chk("five pings inside an hour count once", row["reader_views"], 1)
    chk("last_reader_view_at moved", row["last_reader_view_at"] is not None, True)

    # An hour later the window has reopened. Moved backwards rather than waited.
    db.table("knowledge_bases").update(
        {"last_reader_view_at": (now() - timedelta(hours=1, minutes=1)).isoformat()}
    ).eq("id", kb_id).execute()
    anon.rpc("reader_ping", {"p_kb_id": kb_id}).execute()
    chk("a ping after the window counts", kbrow(kb_id)["reader_views"], 2)

    # --- 2. offline is dark ------------------------------------------------------
    # The same condition the three content RPCs carry: if they would return nothing, this
    # records nothing. A paused help center shows the reader a "paused" screen, not content.
    reset(kb_id, offline_at=now().isoformat())
    anon.rpc("reader_ping", {"p_kb_id": kb_id}).execute()
    row = kbrow(kb_id)
    chk("offline KB is not counted", row["reader_views"], 0)
    chk("offline KB keeps a null last-read", row["last_reader_view_at"], None)
    reset(kb_id, offline_at=None)

    # --- 3. an unknown id leaks nothing ------------------------------------------
    # `[]` is what PostgREST returns for a void function — the same answer a real kb_id
    # gives. That sameness is the point: the caller cannot tell the two apart.
    r = anon.rpc("reader_ping", {"p_kb_id": str(uuid.uuid4())}).execute()
    chk("random uuid returns without error", r.data, [])
    chk("random uuid touched nothing", kbrow(kb_id)["reader_views"], 0)

    # --- 4. execute is granted, the table is not ---------------------------------
    # The point of the RPC: anon may move these two counters through it and may not touch
    # the row any other way. RLS is row-level and cannot express column scope, so the ONLY
    # thing standing between anon and knowledge_bases is that there is no anon policy.
    anon.rpc("reader_ping", {"p_kb_id": kb_id}).execute()
    chk("anon can execute reader_ping", kbrow(kb_id)["reader_views"], 1)

    upd = anon.table("knowledge_bases").update({"reader_views": 9999}).eq("id", kb_id).execute()
    chk("anon direct UPDATE writes no rows", upd.data, [])
    chk("counter unchanged by the direct write", kbrow(kb_id)["reader_views"], 1)

    sel = anon.table("knowledge_bases").select("id").eq("id", kb_id).execute()
    chk("anon direct SELECT reads no rows", sel.data, [])

    # NOT covered here: that the function is `security definer` with a pinned
    # `set search_path = public`. That needs pg_catalog, which PostgREST does not expose,
    # and the only driver that could reach it is not in worker/requirements.txt. It is
    # declared in migration 0031 and checked against pg_proc when that migration is applied.

finally:
    db.table("knowledge_bases").update({
        "reader_views": before["reader_views"],
        "last_reader_view_at": before["last_reader_view_at"],
        "offline_at": before["offline_at"],
    }).eq("id", kb_id).execute()
    print(f"\n-- restored {kb_name} to reader_views={before['reader_views']!r} "
          f"last_reader_view_at={before['last_reader_view_at']!r}")

print(f"\n{'ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
