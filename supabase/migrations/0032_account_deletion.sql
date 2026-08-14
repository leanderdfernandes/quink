-- 0032 — self-serve account deletion
--
-- We are about to publish a privacy policy promising deletion on request, and DPDP gives
-- people the right to withdraw consent. The promise has to be real and it should not be a
-- support ticket. The worker owns the flow (service role: deleting auth.users and storage
-- objects both need it, and the browser must never hold that key).
--
-- Almost nothing is needed here, deliberately — the FK graph already does the work:
--
--   profiles.id        -> auth.users        ON DELETE CASCADE
--   knowledge_bases    -> profiles(owner_id) ON DELETE CASCADE
--   articles           -> knowledge_bases    ON DELETE CASCADE
--   steps              -> articles           ON DELETE CASCADE
--   folders            -> knowledge_bases    ON DELETE CASCADE
--   jobs.user_id       -> profiles           ON DELETE SET NULL   (0017)
--   jobs.kb_id         -> knowledge_bases    ON DELETE SET NULL   (0022)
--   jobs.article_id    -> articles           ON DELETE SET NULL   (0014)
--   article_feedback   -> both               ON DELETE SET NULL   (0025)
--
-- So one `auth.users` delete removes every owned row and ANONYMISES the run ledger rather
-- than destroying it — which is the outcome we want and the reason no new FK is added here.
-- §10b: the ledger is append-only and drives the daily spend breaker; deleting those rows
-- would silently rewrite our own cost history. Verified against pg_constraint, not assumed.

-- ---------------------------------------------------------------------------
-- The one thing the graph cannot give us: the confirmation email's marker
-- ---------------------------------------------------------------------------
-- §10h: `mailer.send_once` is the only public send and `marker=` is a required keyword, so
-- the marker column has to exist somewhere. `profiles` is the right row — it is still there
-- when the email goes out (the send happens before any destruction) and it disappears with
-- the account, exactly like `trial_purged_email_sent_at` on a KB about to be purged.
--
-- WHICH CYCLE DOES IT BELONG TO (§10h)? None. An account is deleted once, terminally. So it
-- never resets — same reasoning as `domain_live_email_sent_at`, opposite to the four
-- `trial_*` markers that DO reset in claim_kb(). Do not add it to a reset list.
alter table public.profiles
  add column if not exists account_deleted_email_sent_at timestamptz;

comment on column public.profiles.account_deleted_email_sent_at is
  'Marker for the account-deletion confirmation (mailer.send_once). Never resets — deletion is terminal, not a cycle. Written by the worker service role only.';

-- ---------------------------------------------------------------------------
-- Column grants — the §10e.2 check, done deliberately rather than discovered later
-- ---------------------------------------------------------------------------
-- Adding a column to a table inherits that table's existing write policy, and RLS is
-- row-level and CANNOT express column scope. That is exactly how profiles.plan and
-- profiles.is_admin were world-writable the moment they were added. `profiles` already has
-- a blanket `for update using (id = auth.uid())` policy, so this new column is only safe
-- because migration 0015 scoped the UPDATE *grant* to `last_kb_id` alone.
--
-- This asserts that rather than trusting it: if the grant list ever widens, this migration
-- fails loudly instead of shipping a client-writable delivery marker (a user who could
-- stamp it would suppress their own confirmation email).
do $$
declare bad text;
begin
  select string_agg(column_name, ', ') into bad
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and privilege_type = 'UPDATE'
     and grantee in ('anon', 'authenticated')
     and column_name <> 'last_kb_id';
  if bad is not null then
    raise exception
      'profiles UPDATE is granted on more than last_kb_id (%). Deletion markers, plan and is_admin must never be client-writable — see CLAUDE.md 10e.2.', bad;
  end if;
end $$;
