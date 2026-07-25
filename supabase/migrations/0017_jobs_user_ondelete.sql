-- Let a user be deleted after their KB has been transferred away.
--
-- Found by the transfer acceptance run: deleting account A failed silently, every time,
-- and only succeeded once account B had been deleted too.
--
-- `jobs.user_id` was added in 0014 as `references profiles(id)` with no ON DELETE clause,
-- which means NO ACTION — the strictest option, by omission rather than by decision.
-- Normally that never shows: deleting a user cascades their knowledge_bases, which cascades
-- their jobs, so nothing is left pointing at them.
--
-- Transfer breaks that chain. After a claim, A's ledger rows point at a KB that B now owns,
-- so they are NOT cascaded when A is deleted — and the FK blocks the delete. The result is
-- that every original owner of a transferred KB is permanently undeletable, which is a
-- problem the first time someone asks us to delete their account.
--
-- `set null` and not `cascade`: the ledger row records that a run was spent producing a
-- specific article, and that article still exists in the KB that now belongs to someone
-- else. The run happened. Deleting the person who paid for it shouldn't erase the record —
-- it should just stop naming them.
alter table public.jobs alter column user_id drop not null;

alter table public.jobs drop constraint jobs_user_id_fkey;
alter table public.jobs add  constraint jobs_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- The quota query is `where user_id = $1`, which never matches null — a deleted account
-- has no quota to enforce, so no code changes with this.
