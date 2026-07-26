# checklist.md — Route to first paying customers

Living document. Edit as we go. Companion to `pricing-spec.md`, `ux-spec-v2.md`,
`video-to-docs-mvp.md`.

**Current state:** Product live on domain, nobody knows about it. Auth, generation, and
hosting (incl. custom domain) work. No payments. No metrics. No legal docs.

**Goal of this phase:** 10 paying founding customers, INR, sold by hand.

**How to read this:** `[ ]` = to do. `[?]` = blocked on a decision from Lee (see §Decisions).
Items are ordered within each phase; the order is deliberate.

---

## Locked decisions (this conversation)

- **First batch:** 10 paid founding customers, manual sale, no free design partners.
- **Currency:** INR only. USD deferred until a non-Indian lead appears.
- **Founding price:** ₹999/mo, Starter features, locked forever, capped at 10 seats.
  Monthly — NOT annual, because annual prepay hides the day-30 retention signal (B4).
  **Price lives in a `plans` table in Supabase, editable without a deploy.** One price
  per plan for everyone — no per-customer price column. Adjust the number before the
  first customer; after that, changing it changes it for all (see §Decisions D2).
- **Entity:** Sole proprietorship. Udyam + current account. No Pvt Ltd until raising or
  liability demands it.
- **Payments:** No processor for customers 1–5 — invoice + bank transfer/UPI. Razorpay
  link once the current account exists. Real payment system deferred to Phase 3.
- **Emails:** Sent by hand from Lee's inbox until customer ~15. No lifecycle automation.
- **Acquisition:** Reverse demo (build a live help center for their product unasked,
  send the link). Primary and effectively only channel for this batch.
- **ICP narrowed:** Founder-led small SaaS, India. Not "small support/ops teams" —
  teams with staff to delegate writing to feel the pain less.

---

## Phase 1 — MVP ready for real users

Nothing in Phase 2 starts until this is done. Estimated: one week of focused work.

### 1.1 Irreversible first

- [ ] **Store the pre-edit generated article snapshot at generation time.**
      A column, not a feature. This is the ONLY passive measure of A3
      (generated-vs-published edit distance). If it isn't captured now, it's lost
      forever for every early user. Do this before anything else.

### 1.2 Cost floor — before any stranger touches it

- [ ] Hard free-tier cap enforced **server-side / in DB**, not in UI: **3 lifetime AI
      video runs** (manual articles unlimited — the cost is generation, not hosting).
      Counted from the `jobs` ledger, not `articles`, so deleting an article never
      returns a run. See `mvp-dev-plan.md` §3–4.
- [ ] 30-day expiry job for free-tier content: soft-delete at day 30, hard-delete at
      day 37 (`ux-spec-v2.md` §6)
- [ ] Daily Gemini spend circuit breaker (already assumed by `pricing-spec.md` §3, not built)
- [ ] Confirm Gemini **paid** tier is active (data-not-used-for-training depends on it,
      and you're about to claim this publicly — see 1.6)

### 1.3 Product test — do this early, not in Phase 2

- [ ] **3 reverse demos on products you don't control.** Sign up for a real SaaS, record
      3 workflows, run them through Quink, host the result.
      This is not marketing yet — it's the last product test. Your eval set is 8 videos
      you chose. If the pipeline breaks on someone else's product on a day you weren't
      optimizing, everything below is moot. Costs one evening. Produces the outreach
      artifacts anyway. **Full mechanic, targeting criteria, and etiquette: Appendix A.**
- [ ] Log what broke in `LEARNINGS.md`

**Two product blockers that must be cleared before demo #1:**

- [ ] **Multi-KB for your own account.** Product is 1 KB per email by design
      (`ux-spec-v2.md` §3). Running 30 reverse demos needs 30 KBs. Add an internal admin
      flag that lifts the KB limit on your own account — better than 30 email aliases,
      and it's the Growth-tier multi-KB capability you'll need anyway.
- [ ] **Ownership transfer path.** When a founder says yes, how does that KB become
      theirs? At 10 customers, changing the account email by hand in Supabase is fine —
      but confirm it's actually possible before you start promising links.

### 1.4 Failure visibility

- [ ] Sentry wired (Render logs are not enough once real users exist)
- [ ] **User-facing failure state** — what does someone see when generation fails?
      Currently: nothing good. First real customer will hit this.
- [ ] Support email that a human reads, surfaced in-app

### 1.5 Metrics — ~6 events, resist thoroughness

- [ ] PostHog installed, **cookieless mode** (skips the EU cookie banner for now)
- [ ] `upload_started`
- [ ] `article_generated`
- [ ] `article_published`
- [ ] `domain_connected`
- [ ] `reader_pageview`
- [ ] `article_edited` (with timestamp — this is what answers B4 at day 30/60)
- [ ] Business-critical counters (articles used, plan state) stored in **own DB**, not
      only PostHog (per CLAUDE.md principle)

### 1.6 Legal + trust

Generators are fine at this stage: Termly (free tier), iubenda (~$29–99/yr),
GetTerms (cheap one-off). Do not pay a lawyer yet. But a generator will miss everything
below — write these clauses yourself.

- [ ] Privacy Policy published — **hard blocker for the Google OAuth consent screen**
- [ ] Terms & Conditions published
- [ ] Subprocessor list: Google/Gemini, Supabase, Render, Cloudflare (or Vercel),
      PostHog, Razorpay
- [ ] Statement that recordings are processed by Google Gemini and **not used for model
      training** (verify against current Gemini paid-tier terms before publishing)
- [ ] Source video retention terms (deleted after first publish, per `ux-spec-v2.md` §9)
- [ ] 30-day free-tier deletion stated in T&C — not only in UI copy. It's a
      data-destruction term, and `pricing-spec.md` flags under-disclosure as a
      dark-pattern risk.
- [ ] Customer content ownership + the hosting license they grant you
- [ ] Acceptable use + takedown rights (someone will point a custom domain at you)
- [ ] Simple DPA available on request (customers will ask; you're their processor)
- [?] **Trust page** — plain-language "where does my video go?" This is a sales asset,
      not compliance. Support teams uploading recordings of internal admin tools will
      raise this on calls. Needs Lee's input on what's actually true (see Decisions §D4).
- [?] Privacy policy needs a contact address. Sole prop = home address becomes public.
      Virtual office is ~₹1,000/mo if that's not acceptable.

### 1.7 Hosting compliance

- [?] **Vercel Hobby is not permitted for commercial use** and Vercel enforces it.
      Two valid paths — pick one (see Decisions §D3):
      - Vercel Pro, $20/mo
      - Migrate frontend to Cloudflare Pages (free tier, no commercial restriction;
        Cloudflare for SaaS also fits the custom-hostname-per-customer need)

### 1.8 Payment rails — minimum viable

- [ ] Udyam (MSME) registration — free, online, ~1 day
- [ ] Current account in business name (gates Razorpay onboarding)
- [ ] `plan` column in DB + documented manual flip procedure
- [ ] In-app blocked state at article #4 — the strongest conversion trigger, stronger
      than the 30-day expiry email
- [ ] Activation expectation copy ("activated within a few hours") so nobody sits
      watermarked overnight after paying
- [ ] Razorpay payment link (once current account exists). Customers 1–5 can be invoiced
      directly if this lags — do not let it block Phase 2.
- [ ] Verify: does Razorpay onboard sole proprietors with Udyam + current account only?

---

## Phase 2 — First ten customers

- [ ] Target list: 30 India-based founder-led SaaS with bad or missing help centers.
      Sources: Indian Product Hunt launches, MicroSaaS India, Indie Hackers India,
      Bengaluru startup Twitter/LinkedIn. **Screening criteria: Appendix A.**
- [ ] Write the outreach message once (not 30 times)
- [ ] Send first 10 reverse demos
- [ ] Intake call with each customer who converts (30 min, noted)
- [ ] Get written permission to use their live help center as a public case study —
      this is worth more than the ₹999
- [ ] Day-30 call with each (15 min)
- [ ] Weekly: one metrics review, one number, one change

**Weekly questions, in order:**
- Weeks 1–4: does the output survive contact with a product they know cold? (A3 —
  edit distance)
- Weeks 5–8: will they go live on their own domain? (B2)
- Weeks 9–12: is anyone still editing at day 30? (B4 — make-or-break)

---

## Phase 3 — Systematize (only after the price holds)

- [ ] Real payment integration (webhooks, subscription state, self-serve upgrade)
- [ ] Lifecycle emails automated
- [ ] Decide MoR for USD: Lemon Squeezy vs Paddle vs Dodo Payments
- [ ] CA consultation before payment #10 — GST on export vs domestic supply, LUT
- [ ] Revisit entity structure

---

## Decisions needed from Lee

- ~~**D1 — Founding offer definition.**~~ **CONFIRMED:** Starter features at ₹999/mo,
  20 AI runs/month, unlimited manual Markdown, locked forever, cap 10. `founding` ships
  as its own plan value, not "starter with a note."
- **D2 — What happens when the founding period ends?** *Still open, and now load-bearing:*
  price is stored once per plan, so raising `founding` later raises it for everyone on it.
  Until Phase 3 the DB price is display-only (charging is a manual invoice / Razorpay
  link), so the practical exposure is low — but it becomes real the moment subscriptions
  are automated. Decide before Phase 3, not before customer #1.
- **D3 — Vercel Pro (~₹1,700/mo) or migrate to Cloudflare Pages (free, some work)?**
- **D4 — Trust page claims.** Need the actual truth on: how long source videos live,
  who at your end can access them, whether Gemini paid tier is confirmed active,
  what happens to data on account deletion.
- **D5 — Founding customers on custom domains?** They'll want it. It's your stickiest
  feature and your biggest support burden. In or out for the first batch?

---

## Conflicts with existing specs (surfaced, not resolved)

1. **Pricing ladder derivation.** `pricing-spec.md` v2's ₹1,499 / ₹3,999 tiers were
   derived from USD anchors (Scribe $25–29/seat, Document360 $199+) and charm-priced into
   INR. If India is now the **beachhead** rather than a localization, that ladder should
   be rebuilt from Indian willingness-to-pay, and ₹3,999 becomes the top tier rather than
   a translation of $79. Do not drift into this by accident.

2. **Willingness-to-pay evidence is from the cheaper market.** Add a note to
   `pricing-spec.md`: *"launch cohort is INR; USD anchoring untested."* So future-you
   doesn't over-read ten Indian data points as global validation.

3. **Value/labor-cost coupling.** `pricing-spec.md` §0 says the buyer pays for "the week
   of article-writing they never do." That week is cheaper in India. The pitch survives
   for **founder-led** teams (founder time is expensive everywhere) but weakens for teams
   with staff to delegate to. This is why the ICP narrowed above.

4. **Lemon Squeezy is a locked decision under pressure.** LS is being folded into Stripe
   Managed Payments, new Indian merchants may face Stripe invite-system or PayPal-only
   payouts, and payouts are USD. Not a Phase 1 problem (INR + Razorpay), but the lock
   should be revisited before USD launch.

---

## Appendix A — The reverse demo, in detail

The primary (effectively only) acquisition channel for this batch. It exists because
Quink does both halves: Scribe can't send a link (no hosting), Document360 can't either
(you'd have to write it first).

### The mechanic

1. Pick a target. Sign up for their free trial yourself.
2. Screen-record 3 things a **new user** does in their first session — e.g. for an
   invoicing tool: create your first invoice, set up recurring billing, add a teammate.
   ~5 minutes of recording total.
3. Run all 3 through Quink.
4. You now have a live, branded help center **for their product**, at
   `theirname.quink.online`.
5. Email the founder: *"Noticed [product] doesn't have docs. Made you one in 20 minutes
   — here's the link. It's yours if you want it."*

No demo call, no trial signup, nothing for them to imagine. They click and see their own
product documented.

### Hosting convention

- Each demo KB gets its own subdomain: `zippy.quink.online`, `acme.quink.online` — the
  same free-subdomain mechanism real customers use before connecting their own domain.
- `help.quink.online` is **Quink's own help center**, built with Quink. Dogfooding plus
  SEO surface. Not where demos live.

### Screening criteria

- Founder-led, small, India-based
- **Self-serve free trial** — no sales call, no demo gate to get in
- **Visibly missing or bad docs** — check whether `help.` / `docs.` on their domain
  exists at all. Often nothing, or a stale Notion page
- Web-based, recordable without integrations or fake data
- Founder reachable — Twitter, LinkedIn, or a real email address

**Strongest pain signal:** a founder personally answering the same questions repeatedly
in their own Discord or support inbox. They already know they need docs and haven't had
time.

### Etiquette (non-negotiable)

You're publishing content about someone else's product using their name.

- **noindex every demo KB** (free tier already is) so it never competes with their own
  pages or confuses their customers
- Frame as an unsolicited demo, never as anything official or affiliated
- Never record behind a paywall you didn't pay for
- Never record anything showing other users' data
- **If they say no, delete it that day.** No exceptions.

### The first three are a product test, not outreach

Pick three products with genuinely different UI styles — a dense dashboard, a simple
form-based tool, something modal-heavy. The point is to break the pipeline on software
you weren't tuning against. A failure here is good news; a failure at customer #4 is not.

If it holds up, you also have your first three outreach artifacts for free.

---

## Log

<!-- Append: date, what changed, what we learned. -->

- **2026-07-25** — Checklist created. Phase 1 scope set. Currency reversed to INR-first.
  Payment build deferred to Phase 3.
- **2026-07-25** — Reverse-demo mechanic specced (Appendix A). Two new Phase 1 blockers
  found: multi-KB admin flag and KB ownership transfer. Neither exists today; both gate
  demo #1.
- **2026-07-25** — `mvp-dev-plan.md` written: entitlements, run ledger, failure taxonomy,
  Telegram alerts, admin surface, KB routing, help center. Free-tier unit changed from
  3 articles to **3 lifetime video runs + unlimited manual + 30-day expiry**, making free
  consistent with the paid runs-vs-manual split. Prices moved to a DB `plans` table.
  **Found: repo `pricing-spec.md` is the superseded v1 (Solo tier, ₹2,499). Replace with
  the v3 in outputs.**
