-- Email sent-markers.
--
-- The UI promises "you can close this page; we'll email you the moment it's live", and the
-- worker now actually sends that. Which means the second half of the promise matters just
-- as much: exactly ONE email.
--
-- The background loop already can't re-send (domain.sweep() only selects pending/verifying
-- KBs), but POST /api/domain/check — the "Check again" / "Try again" buttons — calls
-- check_once() with no status guard, so a live KB re-checked would email again. An
-- in-memory guard is no guard: the worker restarts on every deploy. The marker has to be
-- on the row.
--
-- mailer.send_once() CLAIMS this column with a conditional update before sending, and
-- releases it only if the provider itself fails. That ordering is what makes two racing
-- ticks safe.
--
-- Not a privileged column (§10e.2): it is a delivery timestamp, so inheriting the existing
-- knowledge_bases policies is correct and no column-GRANT review is needed here. Said out
-- loud because the NEXT column added to this table might not be — that rule is about
-- reading the grants, not the policy.

alter table public.knowledge_bases
  add column if not exists domain_live_email_sent_at timestamptz;

comment on column public.knowledge_bases.domain_live_email_sent_at is
  'Set by mailer.send_once() when the domain-live email is sent. DELIBERATELY NOT RESET '
  'BY claim_kb(), unlike every other owner-derived column (CLAUDE.md 10d): it records that '
  'we sent a message, not owner state. A claimed KB''s custom domain is already live and '
  'does not go live again, so resetting this can only produce a stale notification to the '
  'new owner. Nulling it is how you force a resend.';
