"""One-off backfill: delete storage objects belonging to KBs that no longer exist.

    cd worker && .venv/Scripts/python scripts/backfill_orphaned_storage.py           # dry run
    cd worker && .venv/Scripts/python scripts/backfill_orphaned_storage.py --delete  # for real

WHY THIS EXISTS. `purge_kb_storage()` was broken in two ways until this week: Storage's
`list()` returns only the IMMEDIATE children of a prefix, so nested
`frames/{kb_id}/{article_id}/…` was never removed; and it pages at 100 with no
auto-pagination, so even the flat buckets truncated. Both are fixed going forward, and
neither fix reaches back. Every KB purged to date left its frames behind with no row
pointing at them — unreachable, attributable to nobody, and still held. This clears them
once, before the privacy policy that promises they are gone goes live.

WHAT IT IS NOT. Not a migration, not a sweep, not wired into `run_loop()` or the worker
lifespan. It is run by hand, once, and then it is history. If orphans ever accumulate again
that is a bug in `purge.py`, and the fix belongs there rather than in a recurring cleaner
that quietly makes the bug survivable.

THE ENUMERATION IS BORROWED, NOT REBUILT. The recursive, paginated walk is
`purge._object_paths` and the bucket list is `config.KB_BUCKETS` — imported, never
reimplemented. That is the whole point: if the lister is wrong again it must be wrong in one
place. The only listing this file does on its own is the BUCKET ROOT (to discover top-level
prefixes, which `_object_paths` does not return) and a size lookup that can only annotate
paths the shared walk already found.

IT NEVER WRITES TO THE DATABASE, IN EITHER MODE. Two reads: the in-flight job check and the
KB id list. Everything else is Storage.
"""

from __future__ import annotations

import os
import sys
import uuid

# Run from anywhere: the worker's own directory has to be importable, and it has to be FIRST
# so `mailer` shadows nothing and the local modules win (see mailer.py's docstring).
WORKER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WORKER)
os.chdir(WORKER)

import config  # noqa: E402
import pipeline  # noqa: E402
import purge  # noqa: E402

# Statuses that mean a generation could still be writing frames. Same pair the deletion
# endpoint refuses on — `queued` counts because it has a lane waiting and starts on its own.
IN_FLIGHT = ["queued", "running"]

# Storage pages at 100 and does not auto-paginate. Same constant the shared lister uses; the
# root scan below needs it for the same reason.
PAGE = purge._PAGE
REMOVE_CHUNK = purge._REMOVE_CHUNK


def _fmt(n: float) -> str:
    v = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if v < 1024 or unit == "GB":
            return f"{v:.0f} {unit}" if unit == "B" else f"{v:.1f} {unit}"
        v /= 1024.0
    return f"{v:.1f} GB"


def is_uuid(name: str) -> bool:
    """Strict: the prefix must be a plain canonical UUID.

    `uuid.UUID()` alone is too permissive — it accepts braces, urn: prefixes and stray
    hyphenation, all of which would be an unexpected layout rather than a kb_id. Anything
    that fails this is REPORTED AND NEVER DELETED: an object layout we did not predict is
    something to show a human, not something to guess about.
    """
    try:
        return str(uuid.UUID(name)) == name.lower()
    except (ValueError, AttributeError, TypeError):
        return False


def root_entries(bucket: str) -> list[dict]:
    """Every top-level entry in a bucket, paginated.

    The one thing `purge._object_paths` cannot give us: it returns object PATHS and descends
    through prefixes, whereas the diff we need is against the prefix names themselves.
    """
    store = pipeline.db().storage.from_(bucket)
    out: list[dict] = []
    offset = 0
    while True:
        page = store.list("", {"limit": PAGE, "offset": offset}) or []
        out.extend(page)
        if len(page) < PAGE:
            return out
        offset += PAGE


def sizes_for(bucket: str, paths: list[str]) -> dict[str, int]:
    """Byte size per path, for paths the shared walk ALREADY found.

    Deliberately not a traversal: the parent directories are derived from `paths` by string
    split, so this cannot discover an object, cannot miss one, and cannot influence what gets
    deleted. It only annotates. A path whose size can't be read counts as 0 and the report
    says the total is a floor.
    """
    store = pipeline.db().storage.from_(bucket)
    out: dict[str, int] = {}
    for parent in sorted({p.rsplit("/", 1)[0] for p in paths}):
        offset = 0
        while True:
            page = store.list(parent, {"limit": PAGE, "offset": offset}) or []
            for e in page:
                meta = e.get("metadata") or {}
                if e.get("id"):
                    out[f"{parent}/{e['name']}"] = int(meta.get("size") or 0)
            if len(page) < PAGE:
                break
            offset += PAGE
    return out


def refuse_if_jobs_in_flight() -> None:
    """A generation writing frames into a KB whose row has not landed yet is exactly the case
    the safety rule cannot see: the prefix exists, no row names it, and it is NOT an orphan.
    So the answer is not a cleverer rule, it is refusing to run."""
    res = (
        pipeline.db()
        .table("jobs")
        .select("id, kb_id, status", count="exact")
        .in_("status", IN_FLIGHT)
        .limit(5)
        .execute()
    )
    if res.count:
        print(f"REFUSING TO RUN: {res.count} job(s) in flight ({'/'.join(IN_FLIGHT)}).")
        for j in res.data or []:
            print(f"  job {j['id']} status={j['status']} kb={j['kb_id']}")
        print(
            "\nA run in progress is writing frames into a prefix whose KB row may not exist\n"
            "yet, which this script would read as an orphan. Wait for them to finish.\n"
            "If one is wedged, retention.sweep_timeouts() ends it — do NOT edit the row by\n"
            "hand to get past this check."
        )
        sys.exit(2)


def main() -> int:
    # THE LINE THAT MAKES DRY RUN THE DEFAULT. Deletion is opt-in by an explicit flag and
    # there is no env var, no config key and no prompt that can turn it on instead. Getting
    # this backwards on a production bucket is not recoverable.
    delete = "--delete" in sys.argv[1:]

    unknown = [a for a in sys.argv[1:] if a != "--delete"]
    if unknown:
        print(f"unknown argument(s): {' '.join(unknown)}\n{__doc__.splitlines()[2].strip()}")
        return 2

    print("=" * 78)
    print(f"orphaned storage backfill — {'DELETE' if delete else 'DRY RUN (nothing removed)'}")
    print("=" * 78)

    refuse_if_jobs_in_flight()

    # READ THE KB IDS EXACTLY ONCE, HERE, and hold them for the whole run. Re-reading per
    # bucket opens a window where a KB deleted between two reads has one bucket judged live
    # and the next judged orphaned — clearing a live sibling. A KB CREATED mid-run is simply
    # absent from this set, so its prefix is never even considered: safe in the only
    # direction that matters.
    live_kb_ids = {
        r["id"] for r in pipeline.db().table("knowledge_bases").select("id").execute().data or []
    }
    print(f"\nlive knowledge_bases: {len(live_kb_ids)} (read once, held for the whole run)\n")

    total_objects = total_bytes = 0
    cleared: list[str] = []
    failed: list[str] = []
    unexpected: list[tuple[str, str, str]] = []
    plan: list[tuple[str, str, list[str], int]] = []

    for bucket in config.KB_BUCKETS:
        print(f"--- {bucket} " + "-" * (72 - len(bucket)))
        entries = root_entries(bucket)
        live = orphans = 0

        for e in entries:
            name = e["name"]
            if e.get("id"):
                # A FILE sitting at the bucket root, under no KB prefix at all. Not something
                # this codebase writes, so it is unexpected layout, not an orphan.
                unexpected.append((bucket, name, "file at bucket root"))
                continue
            if not is_uuid(name):
                unexpected.append((bucket, name, "prefix is not a UUID"))
                continue
            if name in live_kb_ids:
                live += 1
                continue

            # THE SAFETY RULE, in full: orphaned iff no knowledge_bases row has this id.
            # Not age, not emptiness, not naming.
            paths = purge._object_paths(bucket, name)
            by_size = sizes_for(bucket, paths)
            nbytes = sum(by_size.get(p, 0) for p in paths)
            missing = [p for p in paths if p not in by_size]
            orphans += 1
            total_objects += len(paths)
            total_bytes += nbytes
            plan.append((bucket, name, paths, nbytes))
            note = f"  (size unknown for {len(missing)})" if missing else ""
            print(f"  ORPHAN {name}  {len(paths):>5} object(s)  {_fmt(nbytes):>9}{note}")

        print(f"  {live} live prefix(es) skipped, {orphans} orphaned\n")

    # --- unexpected layout: shown, never touched ----------------------------------------
    if unexpected:
        print("=" * 78)
        print("UNEXPECTED LAYOUT — reported only, NEVER deleted in any mode")
        print("=" * 78)
        for bucket, name, why in unexpected:
            print(f"  {bucket}/{name}   ({why})")
        print()

    if not plan:
        print("No orphaned prefixes found. Nothing to do.")
        return 0

    print("=" * 78)
    print(
        f"TOTAL: {len(plan)} orphaned prefix(es), {total_objects} object(s), "
        f"{_fmt(total_bytes)}"
    )
    print("=" * 78)

    if not delete:
        print("\nDry run — nothing was deleted. Re-run with --delete to remove the above.")
        return 0

    # --- deletion -----------------------------------------------------------------------
    print("\ndeleting…\n")
    freed = 0
    for bucket, name, paths, nbytes in plan:
        store = pipeline.db().storage.from_(bucket)
        try:
            for i in range(0, len(paths), REMOVE_CHUNK):
                store.remove(paths[i : i + REMOVE_CHUNK])
            # Re-list to CONFIRM rather than trusting the absence of an exception — the
            # original bug reported success while deleting nothing (LEARNINGS #8).
            left = purge._object_paths(bucket, name)
            if left:
                failed.append(f"{bucket}/{name}")
                print(f"  FAILED  {bucket}/{name}: {len(left)} object(s) still present")
                continue
            cleared.append(f"{bucket}/{name}")
            freed += nbytes
            print(f"  cleared {bucket}/{name}  {len(paths)} object(s)  {_fmt(nbytes)}")
        except Exception as exc:
            # One stuck object must not strand every prefix behind it. Log, carry on, and
            # let the summary say what still needs a look.
            failed.append(f"{bucket}/{name}")
            print(f"  FAILED  {bucket}/{name}: {exc!r}")

    print("\n" + "=" * 78)
    print(f"prefixes cleared : {len(cleared)}")
    print(f"prefixes failed  : {len(failed)}")
    print(f"bytes freed      : {_fmt(freed)} ({freed} bytes)")
    if failed:
        print("\nstill orphaned — re-run to retry:")
        for f in failed:
            print(f"  {f}")
    print("=" * 78)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
