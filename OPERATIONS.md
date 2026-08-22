# OPERATIONS.md — running the thing, by hand

Manual procedures that live outside the codebase: the steps someone performs, in order,
against production. Anything the software does on its own belongs in code, not here.

This file is **not** the reverse-demo playbook (that is `checklist.md` Appendix A — targets,
etiquette, the email) and **not** the demo legal rules (`legal/LEGAL-IMPLEMENTATION.md` §4 —
noindex, takedown, purge). It is the mechanical steps, and it links to those rather than
restating them, so there is one source of truth per question.

> ⚠️ **Every query in this file runs against production.** Confirm the Supabase project
> name in the dashboard header before you paste. Schema changes never happen here — see
> `CLAUDE.md`.

The staging project and its fixtures are `docs/ENVIRONMENTS.md` and `db/seed.sql`.

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

---

## Team access

Editors other than the owner. Membership is per-KB, invites are email-bound, and the owner
is immovable — nobody, including a Quink admin, can remove them. Every write below goes
through SQL in the Supabase editor: the RPCs derive identity from `auth.uid()`, which is
null in a database session, so they refuse there by design.

### Who is on a help center

```sql
select p.email,
       case when kb.owner_id = p.id then 'owner' else m.role end as role,
       coalesce(m.added_at, kb.created_at) as since,
       m.removed_at
  from public.knowledge_bases kb
  left join public.kb_members m on m.kb_id = kb.id
  join public.profiles p on p.id = coalesce(m.user_id, kb.owner_id)
 where kb.id = '<kb-id>'
 order by (kb.owner_id = p.id) desc, since;
```

`removed_at is not null` is a former member. Those rows are kept on purpose — the
removed-access screen is only possible because they exist.

### Add someone by hand

Only when a customer is stuck. The normal path is the invite, which is the recipient's
consent. They need an account already:

```sql
insert into public.kb_members (kb_id, user_id, added_by)
select '<kb-id>', p.id, null from public.profiles p where p.email = '<their-email>'
on conflict (kb_id, user_id) do update set removed_at = null, added_at = now();
```

### Remove someone

Soft, always. A hard delete turns "you were removed" into "this help center doesn't exist",
which reads as data loss to the person it happens to.

```sql
update public.kb_members set removed_at = now()
 where kb_id = '<kb-id>' and removed_at is null
   and user_id = (select id from public.profiles where email = '<their-email>');
```

### Reissue an invite

Revoke the old link before issuing a new one, or the partial unique index refuses the
insert — there is one live invite per address per help center.

```sql
update public.kb_invites set revoked_at = now()
 where kb_id = '<kb-id>' and email = lower('<their-email>')
   and accepted_at is null and revoked_at is null;

insert into public.kb_invites (kb_id, email) values ('<kb-id>', lower('<their-email>'))
returning 'https://quink.online/invite/' || token;
```

Send that URL. It expires in 14 days and dies the moment `revoked_at` is set. Inviting is a
paid-plan capability resolved from the **owner's** plan — a free-plan help center refuses at
`invite_to_kb()`, and the SQL above bypasses that gate, so do not use it to work around a
plan.

### A member's runs

Runs are charged to the KB owner, stamped at job creation:

```sql
select j.created_at, j.status, j.failure_code,
       presser.email as pressed_by, payer.email as billed_to
  from public.jobs j
  left join public.profiles presser on presser.id = j.user_id
  left join public.profiles payer   on payer.id  = j.billed_to_user_id
 where j.kb_id = '<kb-id>' order by j.created_at desc limit 20;
```

`user_id` is who pressed the button (use it for a failure report), `billed_to_user_id` is
whose quota moved. They differ whenever a member generated the article.
