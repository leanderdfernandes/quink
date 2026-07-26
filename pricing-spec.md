# Pricing & Monetization Spec (v3 — free tier corrected, prices moved to DB)

Companion to `ux-spec-v2.md`, `video-to-docs-mvp.md`, and `mvp-dev-plan.md`. Covers tier
structure, launch numbers, geo pricing, the pricing page, upgrade-modal copy, and the
verified unit economics. All prices ship as **editable config** — as of v3, literally a
Supabase table (§11), not a code constant.

**Status:** Launch pricing decided. Starter is the featured tier; Free is a callout;
Growth ships as a quiet single line (not a full card) at launch.

> **⚠️ Version note.** The repo copy of this file was still **v1** (Solo tier at $12,
> ₹2,499 Starter, no unit economics). This v3 supersedes both v1 and v2 — delete the old
> one rather than keeping it alongside.

### Changed in v3

1. **Free tier unit changed** from "3 lifetime articles" to **3 lifetime AI video runs +
   unlimited manual Markdown articles** (§2). Free now uses the same runs-vs-manual
   mechanic as every paid tier.
2. **30-day expiry gains a countdown and a grace period** (§2, §7) — required, because
   free users can now build far more before losing it.
3. **Prices move out of code into a `plans` table** (§11).

---

## 0. The one strategic sentence

> We do not sell hosting (Zoho sells hosting at $1–3/user). We do not sell recording
> capture (Scribe/Tango sell that at $20–29/seat). We sell **"record instead of write"** —
> a branded, hosted help center that fills itself from screen recordings. The buyer pays
> for the week of article-writing they never do.

Two pricing consequences fall out of that:
1. **Charge per workspace, not per seat.** The wedge against Scribe/Tango, whose cost
   scales with team size. "Flat price, add your whole team" is the headline.
2. **Meter generation generously; make hosting the recurring core.** The North Star is
   *live help centers receiving traffic* — never price in a way that punishes filling or
   reading the KB. (See §3 for the runs-vs-manual split that executes this.)

---

## 1. Competitive price map (why the numbers are what they are)

| Player | Model | Real cost (small team) | What they DON'T do |
|--------|-------|------------------------|--------------------|
| **Zoho Learn** | per user | $1–3/user (~$3–9) | No video pipeline — you write every article by hand |
| **Zoho Desk** | per agent | $14+/agent | KB is a helpdesk add-on; write by hand |
| **Scribe** | per seat | $25–29 solo / $13–15 seat, 5-seat min ($65 floor) | No hosted branded help center — export/embed only |
| **Tango** | per seat | $20–24/user | No hosted help center |
| **Guidde** | per seat | $16–20/creator | Video-doc output, no hosted KB |
| **Document360** | per project | $199–499 (quote-only, no free tier) | Manual writing; abandoned the small buyer |
| **Docsie** | per workspace | $199+ | Manual writing |
| **US** | **per workspace** | **$29 / $79** | — (record-in + host-out; nobody else does both) |

Reading: we're 7–10x under the hosting platforms, and we beat the per-seat capture tools on
**total team cost** while adding hosting they don't have. The Zoho floor is neutralized —
Zoho makes you write by hand; our whole value is that you don't.

---

## 2. Tier structure (LOCKED for launch)

Four plan values: Free · **Founding** · Starter (featured) · Growth (quiet line at launch).
`internal` exists as a fifth, non-commercial plan for Quink's own account (see
`mvp-dev-plan.md` §2).

### Free — the validation hook

Purpose: land the aha, protect API cost. NOT a viable long-term home.

- **USD $0 | INR ₹0**
- **3 AI video runs, lifetime** (NOT per month — countable: *"1 of 3 left"*)
- **Unlimited manual Markdown articles** — same split as the paid tiers (§3)
- Hosted on `*.quink.online`, **watermarked + noindex**
- No custom domain
- **Everything deleted 30 days after the first article is created** — soft-deleted at
  day 30, recoverable through day 37, hard-deleted after. Disclosed before upload, in the
  account wall, on a persistent countdown, and at day 14 / day 7 (§6).

**Why runs and not articles.** Generation is the only variable cost; hosting an article
someone typed costs nothing. Capping articles priced the wrong thing *and* made Free the
one tier that didn't follow §3. One mechanic across all tiers now — and it reads as
markedly more generous while protecting an identical cost envelope. Three lifetime runs is
roughly **6 cents** of Gemini spend (§10).

**Why the run counter is a ledger, not a counter.** Runs are counted from the `jobs`
table, append-only. Deleting an article never returns a run. Without this, free tier is
farmed by delete-and-regenerate in about four minutes.

**Anchor logic:** Scribe's free tier caps hard and blocks PDF/Markdown export;
Document360 killed its free tier entirely. We offer an active, zero-friction, automated KB
page for free. The 30-day deletion is the conversion lever: a user who embeds that page
into a live product dashboard must upgrade to protect their link integrity.

> **Trust caveat (do not skip — and it got sharper in v3).** Under v2's "3 articles," a
> free user could lose at most three things. Under v3 they can hand-write a forty-article
> help center and lose all of it. The deletion pressure is only fair if it is
> *over-disclosed* — before upload, at publish, on a persistent countdown, and in
> escalating warnings at day 14 and day 7 — **and** if day 30 is a soft delete with a
> recovery window, not a purge. Sprung quietly, this becomes exactly the dark-pattern
> complaint we currently use *against* Document360. Honest and early = fair pressure.
> Hidden = churn, refund requests, and bad reviews at the worst possible moment.

### Founding — the first ten, sold by hand

Purpose: the first ten paying customers, INR, manual sale (`checklist.md`).

- **₹999/mo**, monthly only — NOT annual, because annual prepay hides the day-30
  retention signal (B4)
- Starter features in full, **20 AI runs/month**, unlimited manual Markdown
- **Locked forever**, capped at 10 customers
- Its own plan value (`founding`), not "starter with a note" — it must be countable,
  cappable, and immune to a future price migration

### Starter — the featured mid-market disrupter

Purpose: the small support/ops team and the solo-founder sweet spot. The recommended,
default-highlighted card.

- **USD $29/mo · $290/yr** (2 months free) | **INR ₹1,499/mo · ₹14,990/yr**
- 1 user seat
- **20 AI video processing runs / month**
- **Unlimited manual Markdown articles** (§3)
- Custom domain mapping (`docs.yourcompany.com`) + auto-SSL
- Live, unwatermarked, indexed help center
- Remove "Made with" branding fully
- Basic reader analytics (views per article)
- Priority processing queue

**Anchor logic:** Scribe Team forces a 5-seat minimum ($65/mo, ₹5,400+/mo) just to get
custom branding and collaboration — even if only one person creates guides. Zoho Desk seats
add up fast across multiple customer contexts. We are the solo-founder & small-agency sweet
spot at a single-seat-of-Scribe price with hosting they don't offer.

### Growth — the enterprise alternative

Purpose: multi-product shops, small agencies managing several client platforms.
**Ships as a quiet single line at launch, not a full card** (see §2.1).

- **USD $79/mo · $790/yr** (2 months free) | **INR ₹3,999/mo · ₹39,990/yr**
- Everything in Starter, plus:
- **Multi-KB profiles (up to 5 knowledge bases)** — this is where multi-KB belongs, as the
  upsell, NOT the middle tier
- **80 AI video runs / month**
- Unlimited hosting + reads
- Shared team workspace seats
- Advanced analytics, priority support
- (Later) team roles/permissions

**Anchor logic:** Document360 locks professional features behind opaque, sales-led,
call-for-quote pricing that small/mid teams openly complain about on review sites. At
₹3,999/mo, Growth is an instant credit-card-swipe decision for a growing agency managing
5–10 client platforms — no procurement, no demo call.

> **Deliberately deferred:** true multi-tenant / agency-portal pricing (one account →
> dozens of client KBs) is a v2 tier. Do NOT build launch pricing around it (per mvp.md §8).

### 2.1 Launch decision: how many cards to show

**Launch with Free + Starter loud, Growth quiet.** Founding is never on the pricing page —
it's a hand-sold offer delivered by email.

- **Starter** is the loud, default-highlighted, "Most popular" card.
- **Free** is a quiet callout below the cards — never a fourth big card.
- **Growth** is a single understated line: *"Managing multiple products or client sites?
  Growth plans from $79 →"* that expands only on click.

Rationale:
- We have zero pricing data; committing to a full three-card architecture pre-validation is
  premature. Numbers are leap-of-faith guesses to correct in 60 days.
- A visible Growth card invites the multi-KB agency user — the exact customer the MVP doc
  says to *resist* until the core loop retains. Keeping it quiet stops the earliest, most
  valuable feedback signal being pulled toward the wrong segment.
- But keeping Growth *present* as an anchor makes $29 read as the sensible middle choice
  rather than the expensive option (decoy positioning). We get the anchor benefit without
  the build cost or the wrong-buyer pull.
- Promote Growth to a full card only if 60 days of PostHog shows people hitting the 20-run
  cap and asking for multi-KB.

---

## 3. The runs-vs-manual split (the core cost mechanic)

The single cleverest structural decision: **cap the thing that costs money, give away the
thing that doesn't.**

- **AI video runs are capped** — 3 lifetime (Free), 20/mo (Founding, Starter), 80/mo
  (Growth). Each run is a Gemini generation, the only real variable cost.
- **Manual Markdown articles are unlimited on every tier, including Free** — they cost
  nothing to host, and the number of articles in the KB is the metric users
  psychologically count ("I have 40 guides"). Capping it would feel stingy; leaving it
  unlimited makes every tier feel abundant.

This executes "meter the cost, not the value." The user experiences abundance; we bound our
cost. See §10 for why this makes the margin effectively unbreakable.

**Free is bounded by time instead of volume.** An unlimited-manual free tier with no clock
would be a permanently free hosted help center. The 30-day expiry is what makes generosity
affordable — it bounds the *duration* of free hosting rather than the *amount* of work,
which is both cheaper for us and much more pleasant for the user.

**On monthly run caps for paid tiers — keep them soft, not hard walls.** Real usage is
front-loaded (a team dumps existing workflows in weeks 1–4, then tails to maintenance). A
hard cap either blocks the initial fill (bad) or is set so high it's not a constraint
(pointless). Included quota + cheap top-up + a "you're over this month, keep going?"
nudge. Until Phase 3 this is implemented as: **over-cap runs proceed and alert Lee**
(`mvp-dev-plan.md` §4). The *hard* protection lives in infrastructure — the **daily Gemini
spend circuit breaker** — not a user-facing wall.

**Free is the exception: its run cap IS a hard wall.** No relationship exists yet, and it
is pure cost protection.

---

## 4. Geo pricing — USD default, INR for India

**Detect by IP, not account country** (a US visitor must never see ₹; an India visitor sees
₹ by default). Fall back to USD if geo is uncertain. Let the user override via a currency
switch in the pricing page header. Store the *display* currency; the processor handles the
actual charge currency.

INR is **charm-priced locally, not FX-converted.**

| Tier | USD (non-India IP) | INR (India IP) |
|------|-------------------|----------------|
| Free | $0 | ₹0 |
| Founding | — (not offered in USD) | ₹999/mo |
| **Starter** *(featured)* | **$29/mo · $290/yr** | **₹1,499/mo · ₹14,990/yr** |
| Growth | $79/mo · $790/yr | ₹3,999/mo · ₹39,990/yr |

Rules:
- **Annual = pay for 10 months, get 12** (2 months free). Consistent across both currencies.
- Numbers are DB config (§11). INR points are local charm (₹1,499 / ₹3,999), not spot
  conversion.
- Don't show both currencies at once — show one, offer the switch.
- Taxes: GST for INR; a merchant-of-record covers most VAT/tax globally — confirm at build.

> **Launch cohort is INR; USD anchoring is untested.** The ₹1,499 / ₹3,999 ladder was
> derived from USD anchors and charm-priced into INR. If India is the beachhead rather than
> a localization, that ladder should be rebuilt from Indian willingness-to-pay. Do not
> over-read ten Indian data points as global validation. (`checklist.md` §Conflicts 1–2.)

---

## 5. Pricing page structure

Single page, one dominant Starter card + slim Free callout + quiet Growth line.

### Layout (top to bottom)
1. **Header line:** "Flat pricing. Add your whole team. No per-seat fees." — the one line
   that beats Scribe/Tango on sight.
2. **Currency + billing toggle row:** [ USD | INR ] auto-set by IP, and [ Monthly | Annual ]
   with an "Annual — 2 months free" badge on the Annual side.
3. **Starter card** — visually dominant, raised, "Most popular" ribbon. This is where the
   eye should land.
4. **Free callout** below, quiet: *"Just trying it? Start free — 3 guides from video,
   unlimited manual articles, no card."*
5. **Growth line** — single understated row: "Managing multiple products or client sites?
   Growth plans from $79 →" (expands on click).
6. **Comparison strip** (optional, below fold): §1 table reframed as "vs writing by hand"
   and "vs per-seat tools" — sells the wedge without trashing competitors by name.

### Card anatomy
- Tier name + one-line who-it's-for
- Big price (currency + period, switches with toggles)
- "/workspace, not /seat" microcopy under the price
- 4–6 feature lines, the *differentiator* line bolded ("Custom domain + your branding")
- CTA: Starter = "Start with Starter" (featured verb)

### Annual-toggle psychology
- **Default the toggle to Annual.** The lower effective monthly number reads first; monthly
  is the opt-in "I'm not sure yet" choice.
- Show annual as a **per-month equivalent** with the annual total small:
  "$24/mo · billed $290/yr."
- "2 months free" beats "17% off" — a free *thing* out-pulls a percentage.

---

## 6. In-app monetization surfacing (ties to ux-spec-v2 §6)

Free has **two** limits now — runs and days. Show whichever is scarcer in a **single
pill**; two competing meters is noise.

1. **Before upload** (dropzone): *"3 free guides from video · articles kept 30 days."*
   Both halves known before the file is committed.
2. **Account wall:** *"free accounts include 3 video guides, no card needed."*
3. **Persistent pill** in KB chrome — click opens upgrade (proactive path):
   - Days 30–15: neutral — *"12 guides · 22 days left"*
   - Days 14–8: amber — *"Your articles are removed in 11 days"*
   - Days 7–0: persistent banner, not a pill
4. **At the run limit** (reactive): run #4 attempt → upgrade modal naming the exact blocker.
   **Generation blocks; manual writing does not.** Blocking both would punish the thing
   that costs us nothing.

Both paths land on the same modal (§7).

---

## 7. Upgrade modal copy

Fires reactively (hit a limit) or proactively (tapped the pill). Names the blocker, leads
with Starter, keeps hosting-is-the-value framing.

**Reactive (out of free video runs):**
- **Badge:** "You've used your 3 free video guides"
- **Heading:** "Keep building your help center"
- **Body:** "You can keep writing articles by hand for free. To make more guides from
  recordings — and to publish on your own domain without a watermark — pick a plan. Your
  whole team included, no per-seat fees."
- **Card:** Starter $29 (featured, "Most popular"); Growth as a secondary line. Currency
  auto-set by IP, monthly/annual toggle present, annual default.
- **Primary CTA:** "Start with Starter"
- **Reassurance:** "Cancel anytime."

**Proactive (tapped the pill, not yet blocked):**
- **Heading:** "Ready to go live?"
- **Body:** "You've got [N] of 3 free video guides left, and [D] days before free articles
  are removed. Upgrade any time to keep everything and publish on your domain."
- Same card, no urgency badge (they aren't blocked — don't manufacture panic).

**Day-14 expiry warning:**
- **Heading:** "Your help center is removed in [D] days"
- **Body:** "Free help centers are removed 30 days after your first article. Choose a plan
  to keep [N] articles live — nothing changes except the countdown stops."

**Day-7 banner (persistent):**
- **Copy:** "[D] days left — your [N] articles and help center will be removed."
- Dismissible per session, never permanently.

**Post-expiry (soft-deleted, days 30–37):**
- **Heading:** "Your help center is offline"
- **Body:** "Your [N] articles are safe for [X] more days. Choose a plan to bring them
  back — nothing was lost."
- **CTA:** "Restore my help center"

That last screen is the highest-intent moment in the entire free funnel. *"Upgrade to
restore"* converts far better than *"your work is gone,"* and it costs one flag and a cron
job to earn.

---

## 8. Design rules baked in

- **"/workspace not /seat" appears on every price** — it's the whole pitch.
- **Starter ($29) is visually dominant** on page and in modal.
- **Annual defaults on**, shown as per-month-equivalent + "2 months free."
- **One currency at a time**, IP-set, user-overridable.
- **Free is a callout, Growth is a line — neither is a full card at launch.**
- **Cap generation, never manual articles** — on every tier, including Free.
- **No hard monthly wall on paid tiers** — soft nudge + infra circuit breaker. Free's run
  cap is the one hard wall.
- **Deleting content never returns a credit** — quota is an append-only ledger.
- **Expiry is over-disclosed and soft** — countdown, escalation, 7-day grace. Never a
  silent purge.
- **All numbers are DB config** (§11) — this doc fixes the *structure*; month-one data
  sets the *numbers*.

---

## 9. Open decisions

1. **Run top-up mechanics** — one-time pack vs. auto-overage vs. soft nudge. Currently
   "alert Lee and let it through." Resolve with usage data.
2. **INR charm points** — ₹1,499 / ₹3,999 are launch values; validate against early
   Indian signups.
3. ~~**Free-tier unit**~~ — **RESOLVED (v3):** 3 lifetime video runs + unlimited manual
   articles + 30-day expiry.
4. **Promote Growth to a full card?** — decide after 60 days of run-cap + multi-KB demand.
5. **Does the 30-day clock start at first article, or at signup?** — **first article
   created** is assumed throughout this spec and `mvp-dev-plan.md`. Signup punishes
   someone who returns on day 28; last-activity dormancy is kindest but destroys the
   deadline that §2 calls the conversion lever. Confirm or override before building the
   cron.
6. **Numbers overall** — leap-of-faith guesses per lean-startup; correct in 60 days.

---

## 10. Unit economics (verified July 2026 — the margins that make this work)

**Cost inputs (verified Gemini API rates, July 2026):**
- Gemini 2.5 Flash (video → blueprint): $0.30/1M input, $2.50/1M output
- Gemini Flash-Lite (text cleanup): $0.10/1M input, $0.40/1M output
- Gemini bills video at ~300 tokens/sec default (~100 tokens/sec at low-res preprocessing)

### Cost per article generation

| Video length | Default res | Low-res (preprocessed) |
|---|---|---|
| 1 min | $0.015 | $0.011 |
| 2 min | $0.020 | $0.013 |
| 5 min | $0.037 | $0.019 |

A 2-minute recording costs ~**2 cents** to turn into an article.

### Per-customer monthly AI cost (COGS)

| Tier | Runs | AI cost (2-min avg) | Worst case (5-min, maxed) |
|---|---|---|---|
| Free | 3 lifetime | **$0.06 one-time** | $0.11 one-time |
| Founding / Starter | 20/mo | $0.41 (₹36) | $0.73 (₹64) |
| Growth | 80/mo | $1.63 (₹144) | ~$2.90 |

**The free tier's total lifetime cost ceiling is 11 cents.** Unlimited manual articles add
storage measured in kilobytes. This is why v3's more generous free tier costs nothing to
give — the run cap, not the article cap, was always doing the work.

### Unit economics per tier (after ~5% + $0.50 MoR fee)

| Tier | Price | Net after fees | AI COGS | Gross profit | Margin |
|---|---|---|---|---|---|
| Founding | ₹999 | ~₹900 | ₹36 | ~₹864 | **~96%** |
| Starter | $29 | $27.05 | $0.41 | $26.64 | **92%** |
| Growth | $79 | $74.55 | $1.63 | $72.92 | **92%** |

The worst-case Starter customer still clears **91%**. No realistic usage pattern breaks the
margin — the run cap makes cost effectively bounded. This is the payoff of §3's split.

### Fixed platform cost
~**$42/mo** total, shared across all customers (Render worker ~$7 + Supabase Pro ~$25 +
CDN/storage ~$10).

### Break-even & profit at scale (80% Starter / 20% Growth mix)

- **Break-even: ~2 Starter subscriptions** (or ~4 founding customers at ₹999).
- **₹50,000/mo profit: ~18 paying customers.**

| Paying customers | Monthly profit | Yearly |
|---|---|---|
| 10 | ~₹27,000/mo | ₹3.3L/yr |
| 25 | ~₹74,000/mo | ₹8.9L/yr |
| 50 | ~₹1.5L/mo | ₹18L/yr |
| 100 | ~₹3.1L/mo | ₹37L/yr |
| 250 | ~₹7.8L/mo | ₹93L/yr |
| 500 | ~₹15.5L/mo | ₹1.86Cr/yr |

### The strategic implication (drives marketing & segmentation)

**This is not a cost-optimization business — it's an acquisition-and-retention business.**
At 92% margins, every question that matters is on the revenue side: can we get visitors to
upload, do articles come out usable, do help centers stay alive at 30/60 days. Margin work
(WebP, low-res preprocessing, video deletion) is worth doing for *speed and privacy*, not
cost — halving COGS moves a 92% margin to ~96%, which is noise. Getting from 2 to 50
customers is 100% go-to-market. **Marketing and segmentation are where the business is
won.** The unit economics were solved the moment we chose a cheap-model pipeline.

---

## 11. Price configuration — a DB table, not a code constant

**Split the config.** Limits are behaviour and belong in code; prices are business inputs
and belong in the database where they change without a deploy.

| Lives in code (`PLANS`) | Lives in DB (`plans` table) |
|---|---|
| runs, KB count, watermark, noindex, custom domain, expiry days | display price, currency, annual price, payment link, active flag |

```sql
create table plans (
  id             text primary key,          -- free|founding|starter|growth|internal
  display_name   text not null,
  price_monthly  numeric(10,2),
  price_annual   numeric(10,2),
  currency       text not null default 'INR',
  payment_link   text,                      -- Razorpay link — edited WITH the price
  is_public      boolean not null default true,   -- founding/internal = false
  sort_order     int
);
```

- SPA reads it for display (public read on display columns only).
- Worker reads it when generating a payment link.
- Lee edits it in the Supabase table editor. No deploy, no rebuild.

**Two traps this carries:**

1. **Display price ≠ charged price.** Until Phase 3 the actual charge is a Razorpay link
   or a manual invoice. Editing ₹999 → ₹1,299 changes what the page *says*, not what
   anyone *pays*. `payment_link` sits in the same row precisely so the two are visibly
   adjacent and get edited together. **If you change a price, change the link.**

2. **One price per plan, for everyone.** There is deliberately no per-customer price
   column — decided over a denormalised `locked_price` on the profile, on the grounds
   that the founding number will be set before customer #1 and then left alone. The
   consequence, accepted knowingly: raising `founding` later raises it for everyone on
   `founding`, which contradicts "locked forever." Low exposure now (charging is manual;
   the DB price is display-only), real exposure the moment Phase 3 automates
   subscriptions. **Revisit before Phase 3** — `checklist.md` D2.
