-- 0033 — claim_kb() resets last_reader_view_at
--
-- §10d: "All owner-derived state resets in claim_kb(). One function, one place. When you add
-- an owner-derived column, it must be added to that reset list — miss it there and you get a
-- visible bug." Migration 0031 added `last_reader_view_at` and did not do that. This does.
--
-- ONE LINE CHANGES. Everything else below is 0023's body carried over verbatim, including
-- every comment, so a diff of the two shows exactly the one addition and nothing else.
--
-- A NOTE ON WHY THIS IS TIDINESS, NOT AN EMERGENCY. The obvious worry is the subdomain
-- freeze: 0013's sync_kb_subdomain() refuses to move the address once `reader_views > 0`, so
-- a claimed reverse demo could in principle be stuck at acme-demo.quink.online forever — the
-- new owner's first action is renaming the KB to their own product name, and that is the one
-- thing that would not work.
--
-- That hole is ALREADY CLOSED. `reader_views = 0` has been in this reset since 0016, with a
-- comment saying so in as many words, and the trigger reads `old.reader_views` alone. The
-- rename works today and worked before 0031. Verified end to end (supabase/test_transfer.sh
-- and the claim path), not reasoned about.
--
-- What this fixes is the second argument, which stands on its own: pre-claim views are OUR
-- outreach signal and post-claim views are the customer's readers. A timestamp that survives
-- the handover says "last read 3 days ago" about a visit that happened while we were still
-- QA-ing the demo — and `last_reader_view_at` is the column the North Star query and the
-- admin table both read. Merging the two eras makes both numbers mean nothing.
--
-- The DELETE at the bottom still tests `reader_views = 0` alone, deliberately: reader_ping
-- writes both columns in the same statement, so a KB with a non-null timestamp always has a
-- non-zero count. One condition, not two that can disagree.

create or replace function public.claim_kb(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kb_id     uuid;
  v_prev      uuid;
  v_new_owner uuid := (select auth.uid());
begin
  if v_new_owner is null then
    raise exception 'must be signed in to claim';
  end if;

  select id, owner_id into v_kb_id, v_prev
    from public.knowledge_bases
   where claim_token = p_token
     and claim_expires_at > now()
   for update;

  if v_kb_id is null then
    -- Not a live token. If it is one THIS caller already spent, hand back the KB so the
    -- re-click lands somewhere useful. Anyone else gets null — same answer as an unknown
    -- token, so a used link is not a probe.
    select id into v_kb_id
      from public.knowledge_bases
     where claimed_token = p_token and owner_id = v_new_owner;
    return v_kb_id;   -- null unless they own it
  end if;

  -- Claiming your own KB is a no-op, not an error, but must not reset the trial clock —
  -- that would be a free 30-day extension for the price of re-clicking a link.
  if v_prev = v_new_owner then
    update public.knowledge_bases
       set claim_token = null, claim_expires_at = null, is_demo = false,
           claimed_token = p_token, claimed_at = now()
     where id = v_kb_id;
    return v_kb_id;
  end if;

  -- EVERY owner-derived reset lives here. Add to this list, not elsewhere.
  update public.knowledge_bases set
      owner_id         = v_new_owner,
      -- The clock starts when THEY take it, not when we built it.
      trial_started_at = now(),
      offline_at       = null,
      purge_at         = null,
      -- The four nudge markers belong to the clock above and reset with it. A claimed KB
      -- whose markers survived would go from "live" to "deleted" in one step, silently.
      trial_day14_email_sent_at   = null,
      trial_day7_email_sent_at    = null,
      trial_offline_email_sent_at = null,
      trial_purged_email_sent_at  = null,
      -- Outreach traffic was ours, not theirs. Zeroing this also un-freezes the address:
      -- migration 0013 locks the subdomain once reader_views > 0, which would otherwise
      -- leave the new owner stuck with whatever we named their help center during
      -- outreach — the first thing they want to change is the one thing they couldn't.
      reader_views     = 0,
      -- Same era boundary, same reason (0031/0033). Reset WITH reader_views, always: these
      -- two are written together by reader_ping and must not be able to disagree about
      -- whether this help center has ever been read.
      last_reader_view_at = null,
      claim_token      = null,
      claim_expires_at = null,
      is_demo          = false,
      -- Not owner-derived: a record of which link was spent, kept so the recipient can
      -- re-click the email they were sent. Never reset.
      claimed_token    = p_token,
      claimed_at       = now()
   where id = v_kb_id;

  -- The previous owner's "last KB" must not point at a KB they no longer own, or our own
  -- next login redirects straight into a customer's help center. This writes to ANOTHER
  -- user's profiles row, and UPDATE on profiles is revoked from `authenticated` — security
  -- definer is what makes this possible, not optional hardening.
  update public.profiles set last_kb_id = null
   where id = v_prev and last_kb_id = v_kb_id;

  -- handle_new_user() provisions a KB on signup, so the reverse-demo path (receive link ->
  -- sign up -> claim) leaves the founder holding TWO KBs on a one-KB plan. That happens on
  -- demo #1, not at some future scale.
  --
  -- If theirs is untouched, bin it: they came for this KB, not a blank one. If it has ANY
  -- content, keep both and let them exceed the limit — over-limit is a far better failure
  -- than deleting something somebody wrote.
  delete from public.knowledge_bases kb
   where kb.owner_id = v_new_owner
     and kb.id <> v_kb_id
     and not exists (select 1 from public.articles a where a.kb_id = kb.id)
     and kb.custom_domain is null
     and kb.reader_views = 0;

  update public.profiles set last_kb_id = v_kb_id where id = v_new_owner;

  return v_kb_id;
end $$;
