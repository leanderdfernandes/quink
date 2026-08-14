"""Fakes-only check for the orphan backfill: `python scripts/test_backfill_orphaned_storage.py`.

No network, no DB, no real bucket. Everything here is about WHICH PREFIX gets deleted, because
that is the only thing in this script that can do damage, and a dry run cannot prove it.

The five cases, each of which is a real way to lose customer data:

  1. a LIVE KB's prefix is never touched — the whole safety rule;
  2. an orphan IS removed, including nested `dense/` three levels down (the LEARNINGS #8 bug,
     which reported success while deleting nothing);
  3. a prefix spanning the 100-object page boundary is cleared COMPLETELY;
  4. a non-UUID prefix is reported and never deleted, in either mode;
  5. one prefix failing does not strand the ones after it.
"""

import io
import os
import sys
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402
import pipeline  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backfill_orphaned_storage as bf  # noqa: E402

LIVE = "11111111-1111-4111-8111-111111111111"
ORPHAN = "22222222-2222-4222-8222-222222222222"
BIG = "33333333-3333-4333-8333-333333333333"
BOOM = "44444444-4444-4444-8444-444444444444"

fails = []


def chk(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}   got={got!r} want={want!r}")
    if not ok:
        fails.append(label)


def build_tree():
    """One bucket's worth of objects, in the shape live Storage returns: an entry with a
    null id is a pseudo-folder, one with an id is a removable object carrying metadata."""
    obj = lambda n, size=10: {"name": n, "id": f"id-{n}", "metadata": {"size": size}}
    dirent = lambda n: {"name": n, "id": None, "metadata": None}
    return {
        "": [dirent(LIVE), dirent(ORPHAN), dirent(BIG), dirent(BOOM), dirent("not-a-uuid")],
        # A live KB, with the same nesting an orphan has — so "it survived" means the rule
        # held, not that the walk simply failed to reach it.
        LIVE: [dirent("art-l")],
        f"{LIVE}/art-l": [dirent("dense"), obj("step-1.webp")],
        f"{LIVE}/art-l/dense": [obj("00000.webp")],
        # The orphan: three levels, exactly the shape the old purge missed.
        ORPHAN: [dirent("art-o")],
        f"{ORPHAN}/art-o": [dirent("dense"), obj("step-1.webp", 100), obj("step-2.webp", 100)],
        f"{ORPHAN}/art-o/dense": [obj("00000.webp", 25), obj("00001.webp", 25)],
        # 150 flat objects: past the 100-per-page boundary in both the walk and the removal.
        BIG: [obj(f"{i:05d}.webp", 1) for i in range(150)],
        BOOM: [obj("stuck.webp", 7)],
        "not-a-uuid": [obj("whatever.webp", 1)],
    }


class _Store:
    def __init__(self, bucket, tree, sticky):
        self.bucket, self.tree, self.sticky = bucket, tree, sticky

    def list(self, path, opts=None):
        opts = opts or {}
        off, lim = opts.get("offset", 0), opts.get("limit", 100)
        return self.tree.get(path, [])[off : off + lim]

    def remove(self, names):
        assert len(names) <= bf.REMOVE_CHUNK, "remove() must be chunked"
        for full in names:
            if full.split("/")[0] == self.sticky:
                continue  # simulates an object that will not go away
            parent, leaf = full.rsplit("/", 1)
            self.tree[parent] = [e for e in self.tree.get(parent, []) if e["name"] != leaf]


class _Jobs:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_a, **_kw):
        return self

    def in_(self, *_a):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return type("R", (), {"data": self.rows, "count": len(self.rows)})()


def fake_db(trees, jobs=(), sticky=None, kbs=(LIVE,)):
    class _Db:
        # Each bucket gets its OWN tree. Sharing one across all three made a deletion in
        # `frames` silently empty the `videos` prefix too, which flatters every count in
        # this file — the fake has to model three independent buckets or the totals are
        # measuring the fake.
        storage = type("S", (), {"from_": lambda _s, b: _Store(b, trees[b], sticky)})()

        def table(self, name):
            if name == "jobs":
                return _Jobs(list(jobs))
            assert name == "knowledge_bases", f"script must not touch {name!r}"
            return _Jobs([{"id": k} for k in kbs])

    return _Db()


def build_buckets():
    return {b: build_tree() for b in config.KB_BUCKETS}


def run(argv, trees, **kw):
    """One invocation, with stdout captured. Returns (exit code, output)."""
    real_db, real_argv = pipeline.db, sys.argv
    pipeline.db = lambda: fake_db(trees, **kw)  # type: ignore[assignment]
    sys.argv = ["backfill", *argv]
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            code = bf.main()
    except SystemExit as e:  # the in-flight refusal
        code = e.code
    finally:
        pipeline.db, sys.argv = real_db, real_argv
    return code, buf.getvalue()


def objects_under(tree, prefix):
    """Everything still present below a prefix, by walking the fake directly."""
    out, stack = [], [prefix]
    while stack:
        p = stack.pop()
        for e in tree.get(p, []):
            (out if e["id"] else stack).append(f"{p}/{e['name']}")
    return out


NB = len(config.KB_BUCKETS)  # the tree is seeded into every bucket

# --- 1. no-args is a dry run -------------------------------------------------------------
print("\n== dry run ==\n")
trees = build_buckets()
frames = trees[config.BUCKET_FRAMES]
code, out = run([], trees)
chk("dry run exits 0", code, 0)
chk("dry run deletes NOTHING", len(objects_under(frames, ORPHAN)), 4)
chk("dry run leaves the big prefix", len(objects_under(frames, BIG)), 150)
chk("says nothing was deleted", "nothing was deleted" in out, True)
chk("names the orphan", ORPHAN in out, True)
chk("does not name the live KB as an orphan", f"ORPHAN {LIVE}" in out, False)
chk("reports the non-UUID prefix", "prefix is not a UUID" in out, True)
# (4 + 150 + 1) orphaned objects per bucket. The live KB's 2 and the non-UUID prefix's 1 are
# excluded — that difference IS the safety rule, counted.
chk("counts orphaned objects only", f"{155 * NB} object(s)" in out, True)
chk("counts orphaned prefixes only", f"{3 * NB} orphaned prefix(es)" in out, True)

# --- 2. delete mode ----------------------------------------------------------------------
print("\n== delete ==\n")
trees = build_buckets()
frames = trees[config.BUCKET_FRAMES]
code, out = run(["--delete"], trees, sticky=BOOM)

chk("LIVE KB prefix survives untouched", len(objects_under(frames, LIVE)), 2)
chk("orphan is emptied", objects_under(frames, ORPHAN), [])
chk("nested dense/ was recursed",
    f"{ORPHAN}/art-o/dense/00001.webp" not in objects_under(frames, ORPHAN), True)
chk("150-object prefix fully cleared (page boundary)", objects_under(frames, BIG), [])
chk("non-UUID prefix NEVER deleted", len(objects_under(frames, "not-a-uuid")), 1)
# every bucket, not just the one spot-checked above
chk("live KB survives in ALL buckets",
    all(len(objects_under(trees[b], LIVE)) == 2 for b in config.KB_BUCKETS), True)

# --- 3. one failure does not strand the rest ---------------------------------------------
chk("the stuck prefix is reported failed", f"FAILED  {config.BUCKET_FRAMES}/{BOOM}" in out, True)
chk("the stuck prefix really is still there", len(objects_under(frames, BOOM)), 1)
chk("failure did not stop the others", f"prefixes cleared : {2 * NB}" in out, True)
chk("summary counts the failures", f"prefixes failed  : {NB}" in out, True)
chk("non-zero exit when something failed", code, 1)

# --- 4. in-flight jobs refuse the whole run ----------------------------------------------
print("\n== in-flight refusal ==\n")
trees = build_buckets()
code, out = run(["--delete"], trees, jobs=[{"id": "j1", "status": "running", "kb_id": "k"}])
chk("refuses to run", code, 2)
chk("says why", "REFUSING TO RUN" in out, True)
chk("refusal deleted nothing",
    len(objects_under(trees[config.BUCKET_FRAMES], ORPHAN)), 4)

print(f"\n{'ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
