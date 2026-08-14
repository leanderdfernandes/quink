# OPERATIONS.md — running the thing, by hand

Manual procedures that live outside the codebase: the steps someone performs, in order,
against production. Anything the software does on its own belongs in code, not here.

This file is **not** the reverse-demo playbook (that is `checklist.md` Appendix A — targets,
etiquette, the email) and **not** the demo legal rules (`legal/LEGAL-IMPLEMENTATION.md` §4 —
noindex, takedown, purge). It is the mechanical steps, and it links to those rather than
restating them, so there is one source of truth per question.

---

## Demo KBs

### Reset the counters immediately before sending outreach

Run this **after** your last QA pass on the demo and **immediately before** the email goes
out:

```sql
update knowledge_bases
set reader_views = 0, last_reader_view_at = null
where id = 'KB-ID';
```

**Why this is a step and not housekeeping.** `reader_ping` cannot tell you apart from the
prospect — it stores nothing identifying, by design, and it debounces per KB rather than per
visitor. So every time you open the demo to check it looks right, you increment the same two
columns the prospect will. Skip this and `last_reader_view_at` says "read 2 hours ago" when
the only reader was you, and "did they open it?" — the single question the whole outreach
motion turns on — is unanswerable on demo #1, which is exactly when you most need the signal.

Reset last, because any visit after the reset counts. If you open it again to double-check
the email link works, reset again.

**You do not need to reset after they claim it.** `claim_kb()` zeroes both columns as part of
the handover (migration 0033), so the new owner starts at zero and pre-claim outreach traffic
never merges into their reader numbers.

### Same-day takedown of a demo

Terms §9 is a **written public commitment**: *"Email support@quink.online and we will delete
it the same day, no questions and no reply required."* It is not a preference, and it is not
a hide — it is a hard delete, performed the day the mail arrives.

Run it from the worker, which owns the one purge implementation:

```bash
cd worker && .venv/Scripts/python -c "import purge; print(purge.purge_kb('KB-ID'))"
```

`True` means storage was cleared and the row is gone. `False` means storage failed and the
row was deliberately left in place — re-run it; do not delete the row to tidy up.

**Do not do this by hand in the Storage tab, and do not delete the row first.** Both are
wrong in ways that are invisible afterwards:

- **Order.** The KB row is the only thing that names the storage prefix. Delete it first and
  the objects are stranded with nothing pointing at them — unreachable by every collection
  path we have, and still held, which is the opposite of what the takedown promised.
- **Nesting.** Frames live at `{kb_id}/{article_id}/step-N.webp` with a `dense/` folder below
  that. Clearing a prefix by hand in the console clears what the console lists, which is one
  level — this is exactly the bug `purge_kb_storage()` was fixed for (LEARNINGS #8), where
  every frame of every purged KB survived while the operation reported success.

`purge_kb()` walks the tree recursively, pages past the 100-object limit, clears all three
buckets, and only then deletes the row. Reply to the sender once it returns `True`.

### Reading the result

`reader_views` counts **hours containing at least one view**, capped at 24/day — not views.
For "did they open it", that is the right shape and the answer is `last_reader_view_at`
moving from null. Do not quote either number to a customer as traffic; see the column
comments in migration 0031 for why.

The admin KBs tab renders `last_reader_view_at` as a relative label, so you do not need SQL
to check — only to reset.
