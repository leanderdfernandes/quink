# team-access-spec.md — multiple admins per help center

Companion to `mvp-dev-plan.md` (§2 entitlements, §9 routing), `pricing-spec.md` (§3 the
runs-vs-manual split), `ux-spec-v2.md`, `CLAUDE.md`.

**Scope rule:** one help center, many editors. Membership is per-KB, invite is by email,
every member is an admin, the owner is immovable. Anything past that — richer roles,
per-article permissions, invite links, an audit log — is named in §11 and not built.

---

## 1. Locked decisions

| # | Decision |
|---|---|
| L1 | **One owner, many admins.** `knowledge_bases.owner_id` stays the single source of ownership. Admins can invite and remove other admins; nobody can remove the owner. |
| L2 | **Entitlements resolve through the KB owner, always** — never through the acting user. This includes the right to invite. |
| L3 | **Inviting is a paid-plan capability.** Free-tier owners see the People screen, gated, naming the blocker. |
| L4 | **Email-bound invites only.** No shareable link. The invited address must match the accepting account. |
| L5 | **Membership does not consume the invitee's own KB allowance.** `PLANS[plan].kbs` counts owned KBs only. |
| L6 | **Claim wipes membership.** `claim_kb()` deletes all `kb_members` rows and revokes pending invites. A prospect never inherits a silent admin. |
| L7 | **Admins never see billing.** Plan, price, upgrade CTA and payment state are owner-only surfaces. |
| L8 | **Presence + stale-write guard ships with this**, not after. Autosave plus two editors is silent data loss. |
| L9 | **Quota is billed to the KB owner at the moment the job starts**, stamped immutably on the job row. |

### Non-goals, and why

- **Roles beyond `admin`.** A viewer/editor split is a support conversation nobody has had
  yet. The `role` column exists with a one-value check constraint so adding a second value
  is a migration, not a refactor.
- **Per-article permissions.** Notion-shaped. Wrong complexity for ten customers.
- **Real-time collaborative editing (Yjs/CRDT).** Weeks of work to solve a problem presence
  solves for two people in one help center. §8 is the proportionate answer.
- **Invite links.** A URL anyone can redeem into a customer's live help center is a support
  incident, not a growth lever, at this size.
- **Removal notification email.** Being emailed that you were removed is worse than
  discovering it. The removed state screen (§9) carries it.

---

## 2. Roles

| Capability | Owner | Admin |
|---|:--:|:--:|
| Articles, folders, steps — create, edit, delete | ✓ | ✓ |
| Generate from video (debits owner's quota) | ✓ | ✓ |
| Publish / unpublish | ✓ | ✓ |
| Theming, KB name, logo, favicon, colour | ✓ | ✓ |
| Invite admins · revoke pending invites | ✓ | ✓ |
| Remove admins | ✓ | ✓ |
| Leave the help center | — | ✓ |
| Custom domain + DNS | ✓ | — |
| Plan, price, upgrade, payment state | ✓ | — |
| Delete the KB · transfer ownership | ✓ | — |
| Be removed | never | ✓ |

**Why the owner is immovable.** Flat admin has two failure modes: two admins removing each
other into a locked account, and an invitee removing the person whose card is on file. One
un-removable role costs nothing and closes both.

**Why domain is owner-only.** An admin changing the CNAME takes a paying customer's live
help center off the internet. That belongs with the person who is accountable for it.

---

## 3. Schema

```sql
create table kb_members (
  kb_id     uuid not null references knowledge_bases(id) on delete cascade,
  user_id   uuid not null references profiles(id)        on delete cascade,
  role      text not null default 'admin' check (role in ('admin')),
  added_by  uuid references profiles(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (kb_id, user_id)
);

create table kb_invites (
  id          uuid primary key default gen_random_uuid(),
  kb_id       uuid not null references knowledge_bases(id) on delete cascade,
  email       text not null,                      -- stored lower(trim(...))
  token       uuid not null unique default gen_random_uuid(),
  invited_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles(id),
  revoked_at  timestamptz
);

-- one live invite per address per KB; expired/revoked/accepted rows stay as history
create unique index kb_invites_one_live
  on kb_invites (kb_id, email)
  where accepted_at is null and revoked_at is null;

alter table jobs     add column billed_to_user_id uuid references profiles(id);
alter table articles add column last_edited_by    uuid references profiles(id) on delete set null;
alter table articles add column last_edited_at    timestamptz;
```

**`on delete cascade` is correct on both `kb_id` FKs here** — membership is state, not a
ledger. This is the opposite call to `jobs.kb_id`, which was deliberately un-cascaded so
the day-37 purge can't wipe the run ledger. Both are right; the difference is worth a
comment in the migration so nobody "fixes" one to match the other.

### RPCs — all `SECURITY DEFINER`, identity from `auth.uid()`

Never accept the acting user as an argument. This is privilege-escalation trap #2 from
`LEARNINGS.md` (`claim_kb` originally took the new owner as a client-supplied argument),
and the invite path is the same shape.

| Function | Notes |
|---|---|
| `invite_to_kb(p_kb_id, p_email) → uuid` | Caller must be owner or member. **Owner's plan must allow invites.** Rejects: the owner's own address, an existing member, a live pending invite. Returns the token. |
| `accept_kb_invite(p_token) → uuid` | Invite must be live and unexpired, and `lower(auth.jwt()->>'email')` must equal `kb_invites.email`. Inserts the member, stamps `accepted_at` / `accepted_by`. Returns `kb_id`. |
| `revoke_kb_invite(p_invite_id)` | Owner or member. Sets `revoked_at`; the link dies immediately, same as the claim-link revoke path. |
| `remove_kb_member(p_kb_id, p_user_id)` | Owner or member. **Refuses if `p_user_id = owner_id`.** Self-removal is the "Leave" action. |
| `kb_people(p_kb_id) → setof …` | Members + pending invites in one shape for the People screen. |

**`kb_people()` is not optional.** Rendering a member list means reading other people's
email and display name, which live on `profiles`. Do **not** widen the `profiles` select
policy to do it — project exactly the four fields the screen needs through a definer
function and leave `profiles` closed.

---

## 4. Entitlements and the invite gate

The check is `PLANS[owner.plan].can_invite`, resolved from `knowledge_bases.owner_id` →
`profiles.plan`. Never from the caller's plan.

```python
# PLANS additions — limits in code, per CLAUDE.md
"free":     {..., "can_invite": False}
"founding": {..., "can_invite": True}
"starter":  {..., "can_invite": True}
"growth":   {..., "can_invite": True}
"internal": {..., "can_invite": True}
```

Two consequences that are easy to get backwards:

1. **A free-plan user who is an admin inside a paid KB can invite.** The gate is the
   owner's plan. They are spending the owner's entitlement, not their own.
2. **The gate is enforced in `invite_to_kb()`, not just in the UI.** The SPA talks to
   Supabase directly; a route guard alone is theatre (same reasoning as `/admin`).

### Downgrade

When a KB's owner drops to `free` — churn, or the founding cohort ending:

- Existing members **keep full access.** Revoking it is a deletion mechanic used as a
  conversion lever, which `LEARNINGS.md` already calls out as trust-eroding.
- New invites are blocked; pending invites are **frozen, not revoked** — they fail at
  accept with a clear reason, and resume if the owner upgrades before expiry.
- No new clock. The KB rides the existing dormancy model. Team access ends when the help
  center goes offline, which is already disclosed.

### This is the strongest upgrade surface after the claim

A claimed reverse demo lands on `free`. The prospect's first instinct after seeing their
own product documented is to show a teammate. The People screen is the wall they meet, and
it is a **want**, not a limit they bumped into — better pressure than the run counter.
Copy in §9.

---

## 5. Quota attribution

Today quota counts `jobs` by `user_id` (`plans.ts:60`). With a second user that is wrong in
both directions: a free-tier teammate is blocked inside a paying help center, and their runs
never touch the owner's meter.

**Stamp `billed_to_user_id` at job creation** as the KB owner at that moment. Then:

- Quota query counts `jobs where billed_to_user_id = <owner> and counted_against_quota`.
- `jobs.user_id` stays as *who pressed the button* — the People screen and the failure
  lookup in `OPERATIONS.md` both want it.

**Why the stamp and not a join.** A join through `kb_id → owner_id` re-bills history on
every ownership change: claim a demo you spent three runs building, and the prospect starts
already at 3 of 3. Stamped at creation, those runs stay on `internal` and the new owner
starts at zero. The immutability is the whole point.

Backfill is `update jobs set billed_to_user_id = user_id` — correct today, while every KB
has exactly one editor. **Land this column with the payments work, ahead of the rest of
this spec.** Retrofitting billing attribution once real multi-user jobs exist is a backfill
with guesses in it.

---

## 6. Ownership transfer

`claim_kb()` gains three lines: delete `kb_members` for the KB, set `revoked_at` on live
`kb_invites`, and leave `jobs` alone.

What the new owner gets: the articles, the folders, the storage, the subdomain, the theming,
the custom domain config — and a clean People screen with exactly themselves on it. What
they do not get: your internal account as a silent admin, and your run history on their
meter.

Support access after handover is unchanged — `is_admin` plus the amber open-as-owner banner,
which is already disclosed as a Trust-page claim (`checklist.md` D4).

**Transfer between two real accounts** (not a demo claim) is a separate, later path and is
not in this spec. When it lands it should reuse the same wipe — the receiving owner decides
who has access, not the sending one.

---

## 7. RLS — splitting `owns_kb()`

`owns_kb()` is referenced across articles, folders, steps, and all three storage buckets.
It becomes two functions and every existing policy gets classified.

```sql
-- unchanged meaning, narrower use
create or replace function owns_kb(p_kb_id uuid) returns boolean ...
  -- auth.uid() = knowledge_bases.owner_id

create or replace function can_edit_kb(p_kb_id uuid) returns boolean ...
  -- owns_kb(p_kb_id) or exists (kb_members where kb_id = p_kb_id and user_id = auth.uid())
```

| Surface | Gate |
|---|---|
| `articles`, `folders`, `steps` — all of CRUD | `can_edit_kb()` |
| Storage: `frames`, `videos`, `branding` | `can_edit_kb()` |
| `knowledge_bases` UPDATE (name, theming, visibility) | `can_edit_kb()` |
| `knowledge_bases` UPDATE (`custom_domain`, `domain_*`) | owner — see below |
| `knowledge_bases` DELETE, ownership transfer | `owns_kb()` |
| `kb_members`, `kb_invites` writes | through the RPCs only |
| `jobs` insert | `can_edit_kb()`, with `billed_to_user_id` derived server-side |

**Column-level split.** Postgres row policies can't gate per column. Use the mechanism
already in the codebase for blocking `is_admin` self-elevation: leave the row policy at
`can_edit_kb()` and **revoke UPDATE on the domain columns from `authenticated`**, routing
domain changes through an owner-only RPC. Don't invent a second mechanism.

⚠️ **`create or replace` is a silent revert vector** (`OPEN-ITEMS.md` D.4 — this is exactly
how the watermark clause was lost across 0024–0026). Every function this migration
recreates must be diffed against its live definition, with the diff stated in the migration
header.

---

## 8. Concurrent editing

Autosave (`useAutosave.ts`) is last-write-wins. Two admins in one article means one person's
paragraph disappears with no error, no conflict, nothing to report. This is the highest-risk
part of the feature and the least visible.

**Presence.** Supabase Realtime presence channel per article, `kb:{kbId}:article:{articleId}`,
payload `{ user_id, name, avatar_url }`. Renders as a face stack in the editor top bar and a
single quiet line under the title when someone else is present.

**Stale-write guard.** Autosave sends the `updated_at` it last read. `save_article(...)`
compares, and on mismatch **refuses the write and returns the conflict** — it never merges,
never clobbers, never silently retries. The client shows a non-destructive strip; the user's
unsaved text stays in the editor until they choose.

Both are needed. Presence prevents most collisions; the guard catches the ones it doesn't
(two tabs, a stale session, an offline window).

**Dormancy signal.** Free-tier persistence keys on "reader or edit signal." Member edits
must count as edit signal. Miss this and a help center actively maintained by an admin who
isn't the owner goes offline on schedule.

---

## 9. Screens and copy

Existing design language: teal accent, Hanken Grotesk, gently rounded, no emoji as icons,
no shimmer. Tokens from `design-system.html`. Nothing here is a new pattern.

### 9.1 People — `/app/:kbId/people`

Rail item below Theming. Single column, no tabs.

**Paid, populated.** One list, members and pending invites together — pending rows are
dimmed with a `Pending` chip and `Resend` / `Revoke` actions. Keeping them in one list is
what makes an invite feel completed rather than sent into a void.

Row: avatar · name · email · role chip (`Owner` / `Admin`) · action. Owner row has no
action. Your own row reads `Leave` if you're an admin.

Invite field sits at the top of the list, not behind a modal — one email input plus
**Send invite**. It's a one-field form; a modal is ceremony for nothing.

**Paid, empty:**
> **Just you, for now**
> Add your whole team. No per-seat fees — invite anyone who should be able to write and
> publish guides here.

**Free (gated).** Show the screen. Hiding it means nobody learns the capability exists.

> **Bring your team in**
> Everyone you invite can write, edit and publish in this help center — no per-seat fees,
> however many people you add.
>
> Adding teammates is part of every paid plan.
> [ See plans ] · Free help centers are single-editor.

Below the block, the real list renders with just the owner row, so it reads as a preview of
a real screen rather than an ad.

### 9.2 Avatar stack — KB top bar

Three faces plus `+N`, click opens People. Present on every KB with more than one person.
This is the ambient signal the feature exists; without it People is a rail item nobody
clicks.

### 9.3 Invite email (Resend, `send.quink.online`)

Subject: **{Inviter} invited you to {KB name}**

Body carries the KB's logo and primary colour — the same branding the recipient will see on
the accept screen and inside the app. One paragraph, one button (**Accept invite**), one
line of context: what the help center is, who invited them, that the link expires in 14
days. Plain-text alternative required.

### 9.4 Accept — `/invite/:token`

Mirror `/claim/:token`'s structure. KB logo, KB primary colour, then:

> **{Inviter} invited you to help maintain {KB name}**
> Sign in to accept. You'll be able to write, edit and publish guides here.
> [ Continue with Google ]

Four states, each with its own copy — do not merge them the way `App.tsx:157` merges
permission-denied and not-found:

| State | Copy |
|---|---|
| Expired | "This invite has expired. Ask {inviter} to send a new one." |
| Revoked | "This invite is no longer active." |
| Wrong account | "This invite was sent to {invited email}. You're signed in as {current email}." + [ Sign in with a different account ] |
| Already a member | Silent redirect to `/app/:kbId` — not an error. |

The wrong-account state is the one people actually hit, because the invite lands in a work
inbox and the browser is signed into a personal Google account. It must be recoverable in
one click, not a dead end.

### 9.5 Removed while active

Next request 403s through RLS, which is immediate enough. It needs its own screen:

> **You no longer have access to {KB name}**
> Your access to this help center was removed. Anything you wrote is still there.
> [ Go to your help centers ]

The reassurance line matters — the instinct on losing access is that your work was deleted.

### 9.6 Editor conflict strip

Non-destructive, sits under the title bar, evergreen not amber (this is information, not
damage):

> **{Name} updated this article.** Your changes aren't saved yet.
> [ Reload their version ] [ Keep mine ]

### 9.7 KB switcher

Two sections: **Yours** and **Shared with you**. The section header is the only place the
distinction needs to appear — inside a KB, an admin's experience is the owner's experience
minus billing and domain.

---

## 10. Acceptance checks

- [ ] A free-plan admin generates a video inside a paid KB; the run debits the **owner's**
      monthly quota and is never blocked by the admin's own lifetime cap.
- [ ] Claim a demo with two members and a pending invite → new owner's People screen shows
      exactly one row, the pending invite link is dead, and their quota reads 0 used.
- [ ] Free-plan owner sends an invite via a direct RPC call → refused server-side.
- [ ] Owner downgrades to free → existing members keep editing; invite field is gated.
- [ ] Admin A removes admin B mid-session → B's next request 403s to the removed screen.
- [ ] Any admin attempts to remove the owner, via UI and via RPC → both refused.
- [ ] Two browsers, same article, both typing → presence shows in both; the second save is
      refused with a conflict, not merged, and no text is lost in either window.
- [ ] Admin loads the KB → no plan, price, or upgrade CTA is rendered or fetched anywhere.
- [ ] Invite to `a@x.com`, accept while signed in as `b@y.com` → wrong-account state, and
      switching accounts completes the accept.
- [ ] A KB whose only recent activity is a **member's** edit does not go offline at day 30.
- [ ] Every function recreated by this migration is diffed against its live definition, and
      the diff is stated in the migration header.

---

## 11. Sequencing, and what's parked

**Gate placement.** This isn't in `OPEN-ITEMS.md` and doesn't belong in Gates 0–1 — the
watermark regression (0.1) and the OAuth consent screen (1.12) still block the only
acquisition channel, and neither is helped by this. Call it **Gate 4**, first thing after
money works.

The one exception is `jobs.billed_to_user_id`, which should ride the Gate 2 payments work
for the backfill reason in §5.

The requester is a prospect, not a customer, so this is a signal rather than a commitment —
worth building because it's cheap and because "add your whole team, no per-seat fees" is
already the line the pricing page leads with, and right now that line isn't true.

**Parked, deliberately:** viewer/editor roles · per-article permissions · invite links ·
audit log of who changed what · SSO/domain-capture invites · transfer between two real
accounts · seat counts in the admin surface.

**Docs to update in the same commit:** `CLAUDE.md` (the `owns_kb` / `can_edit_kb` split, and
the `create or replace` diff rule from D.4) · `OPERATIONS.md` (SQL to list and remove
members by hand) · `OPEN-ITEMS.md` (Gate 4) · **the privacy policy** — a second person can
now read content in a help center, and the standing rule says any change to data access
updates the policy in the same commit.
