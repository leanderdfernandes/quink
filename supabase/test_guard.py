"""The stale-write guard, exactly as the editor performs it, with two real sessions.

    cd supabase && ../worker/.venv/Scripts/python test_guard.py

Autosave was last-write-wins: two admins in one article meant one person's paragraph
vanished with no error, no conflict and nothing to report. This proves the replacement.

It reproduces Editor.claim() move for move — a conditional update on
`articles.updated_at` carrying last_edited_by/at, then (for a step edit) the step write —
because the guard lives in the client and there is no server function to point a test at.
If the editor's save path changes shape, change this with it or it stops meaning anything.

THE ASSERTION THAT MATTERS IS NOT "a conflict was detected". It is that no text is lost in
either window: the winner's text is on the server, the loser's is still in their editor,
and nothing was merged or clobbered in between.

Covers the case a trigger on articles.updated_at would NOT have: a STEP edit. Step writes
touch `steps`, whose own trigger bumps `steps.updated_at` and never the article's — so the
claim is what pulls step edits under the same guard. See LEARNINGS.
"""
import os, sys, time, uuid
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
os.chdir(os.path.join(ROOT, "worker"))
import config, pipeline
ANON = [l.split("=",1)[1].strip() for l in open(os.path.join(ROOT,"web",".env.local")) if l.startswith("VITE_SUPABASE_ANON_KEY")][0]
from supabase import create_client
db = pipeline.db(); fails=[]
def chk(label, got, want):
    ok = got == want; print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok: fails.append(label)
def mk(tag):
    e=f"g-{tag}-{uuid.uuid4().hex[:6]}@example.com"; pw="Gx!"+uuid.uuid4().hex[:8]
    u=db.auth.admin.create_user({"email":e,"password":pw,"email_confirm":True}); time.sleep(0.9)
    return u.user.id,e,pw
def si(e,pw):
    c=create_client(config.SUPABASE_URL, ANON); c.auth.sign_in_with_password({"email":e,"password":pw}); return c

class Window:
    """One open editor: its own session and its own `base` timestamp."""
    def __init__(self, client, uid, article_id):
        self.c, self.uid, self.id = client, uid, article_id
        row = client.table("articles").select("*").eq("id", article_id).single().execute().data
        self.base = row["updated_at"]
        self.local_title = row["title"]

    def claim(self, patch=None):
        r = (self.c.table("articles")
             .update({**(patch or {}), "last_edited_by": self.uid,
                      "last_edited_at": "now()"})
             .eq("id", self.id).eq("updated_at", self.base)
             .select("updated_at").execute())
        if not r.data:
            return False          # REFUSED — nothing written, including the patch
        self.base = r.data[0]["updated_at"]
        return True

    def save_title(self, title):
        self.local_title = title            # the editor's local state, always kept
        return self.claim({"title": title})

    def save_step(self, step_id, body):
        if not self.claim():
            return False
        self.c.table("steps").update({"body_text": body}).eq("id", step_id).execute()
        return True

users=[]
try:
    o,oe,opw = mk("owner"); users.append(o)
    m,me_,mpw = mk("member"); users.append(m)
    db.auth.admin.update_user_by_id(o, {"user_metadata": {"full_name": "Priya Lal"}})
    db.table("profiles").update({"plan":"starter"}).eq("id", o).execute()
    kb = db.table("knowledge_bases").select("id").eq("owner_id", o).execute().data[0]["id"]
    O, M = si(oe,opw), si(me_,mpw)
    tok = O.rpc("invite_to_kb", {"p_kb_id":kb,"p_email":me_}).execute().data
    M.rpc("accept_kb_invite", {"p_token":tok}).execute()
    art = O.table("articles").insert({"kb_id":kb,"title":"Original title","status":"ready",
                                      "slug":f"g-{uuid.uuid4().hex[:6]}"}).execute().data[0]
    step = O.table("steps").insert({"article_id":art["id"],"step_number":1,
                                    "heading":"One","body_text":"original body"}).execute().data[0]

    # Two windows open the SAME article at the same moment.
    w1, w2 = Window(O, o, art["id"]), Window(M, m, art["id"])

    chk("window 1 saves", w1.save_title("Priya's title"), True)
    chk("window 2's save is REFUSED, not merged", w2.save_title("Meera's title"), False)
    server = db.table("articles").select("title,last_edited_by").eq("id", art["id"]).execute().data[0]
    chk("the server holds window 1's text", server["title"], "Priya's title")
    chk("...stamped with who wrote it", server["last_edited_by"], o)
    chk("window 2's own text is untouched in its editor", w2.local_title, "Meera's title")
    print(f"      END STATE  window1={w1.local_title!r}  window2={w2.local_title!r}  "
          f"server={server['title']!r}")

    # "Keep mine": rebase onto what is there, then the NEXT edit writes. Nothing happens
    # until the user acts again.
    before = db.table("articles").select("title").eq("id", art["id"]).execute().data[0]["title"]
    w2.base = w2.c.table("articles").select("updated_at").eq("id", art["id"]).single().execute().data["updated_at"]
    chk("Keep mine writes NOTHING on its own",
        db.table("articles").select("title").eq("id", art["id"]).execute().data[0]["title"], before)
    chk("...and the next edit then succeeds", w2.save_title("Meera's title"), True)
    chk("...and window 1 is now the stale one", w1.save_title("Priya again"), False)

    # STEP writes: the case a trigger on articles.updated_at would NOT have covered.
    w1.base = w1.c.table("articles").select("updated_at").eq("id", art["id"]).single().execute().data["updated_at"]
    chk("a step edit claims the article and writes", w1.save_step(step["id"], "priya body"), True)
    chk("the other window's step edit is refused", w2.save_step(step["id"], "meera body"), False)
    chk("the step still holds the write that won",
        db.table("steps").select("body_text").eq("id", step["id"]).execute().data[0]["body_text"],
        "priya body")

    # The offline case: a window that sat for a while and then saves.
    w2.base = w2.c.table("articles").select("updated_at").eq("id", art["id"]).single().execute().data["updated_at"]
    w1.save_title("edited while they were away")
    time.sleep(1)
    chk("a save after a long gap is refused, not clobbering", w2.save_title("stale write"), False)
    chk("the away window did not overwrite",
        db.table("articles").select("title").eq("id", art["id"]).execute().data[0]["title"],
        "edited while they were away")

    # Single editor: every save succeeds, no conflict, no extra round trip.
    w3 = Window(O, o, art["id"])
    chk("single-user editing is unaffected",
        [w3.save_title(f"solo {i}") for i in range(3)], [True, True, True])
finally:
    for u in users:
        try: db.auth.admin.delete_user(u)
        except Exception as e: print("cleanup:", e)
print("\n" + ("FAILED: " + ", ".join(fails) if fails else "stale-write guard OK"))
sys.exit(1 if fails else 0)
