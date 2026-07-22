# Pricing & Monetization Spec (v2 — locked launch numbers)

Companion to `ux-spec-v2.md` and `video-to-docs-mvp.md`. Covers tier structure, real
launch numbers, geo pricing (USD/INR), the pricing page, upgrade-modal copy, and the
verified unit economics behind the numbers. All prices ship as **editable config**, never
hardcoded — structure is fixed here, numbers correct with month-one data.

**Status:** Launch pricing decided. Starter is the featured tier; Free is a callout;
Growth ships as a quiet single line (not a full card) at launch, promoted only if usage
data demands it.

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

Three tiers: Free (validation hook) + Starter (featured) + Growth (quiet line at launch).

### Free — the validation hook
Purpose: land the aha, protect API cost. NOT a viable long-term home.
- **USD $0 | INR ₹0**
- **3 lifetime hosted articles** (NOT per month — countable: "1 of 3 left")
- Hosted on `*.helpkit.site`, **watermarked + noindex**
- No custom domain
- **Articles deleted after 30 days** if not upgraded (stated clearly, and repeatedly —
  see §7 note on trust)
- Account wall fires before generation (cost protection, per CLAUDE.md)

**Anchor logic:** Scribe's free tier caps hard and blocks PDF/Markdown export; Document360
killed its free tier entirely. We offer an active, zero-friction, automated KB page for
free. The 30-day deletion is the conversion lever: a user who embeds that page into a live
product dashboard must upgrade to protect their link integrity.

> **Trust caveat (do not skip):** the deletion pressure only works if it's *over-disclosed*
> — before publish, at publish, and in the expiry nudge. Sprung quietly it becomes the kind
> of dark-pattern complaint we currently use *against* Document360. Honest and early = fair
> pressure. Hidden = churn + bad reviews.

### Starter — the featured mid-market disrupter
Purpose: the small support/ops team and the solo-founder sweet spot. The recommended,
default-highlighted card.
- **USD $29/mo · $290/yr** (2 months free) | **INR ₹1,499/mo · ₹14,990/yr**
- 1 user seat
- **20 AI video processing runs / month**
- **Unlimited manual Markdown articles** (the cost is in generation, not in articles —
  so manual authoring is free to give away; see §3)
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

**Launch with Free + Starter loud, Growth quiet.**

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

- **AI video runs are capped** (20 Starter / 80 Growth) — each run is a Gemini generation,
  the only real variable cost.
- **Manual Markdown articles are unlimited** — they cost nothing to host, and the number of
  articles in the KB is the metric users psychologically count ("I have 40 guides"). Capping
  it would feel stingy; leaving it unlimited makes the tier feel abundant.

This executes "meter the cost, not the value." The user experiences abundance; we bound our
cost. See §10 for why this makes the margin effectively unbreakable.

**On monthly run caps — keep them soft, not hard walls.** Real usage is front-loaded (a team
dumps existing workflows in weeks 1–4, then tails to maintenance). A hard cap either blocks
the initial fill (bad) or is set so high it's not a constraint (pointless). Included quota +
cheap top-up + a "you're over this month, keep going?" nudge. The *hard* protection lives in
infrastructure: the **daily Gemini spend circuit breaker** (already in the architecture),
not a user-facing wall.

---

## 4. Geo pricing — USD default, INR for India

**Detect by IP, not account country** (a US visitor must never see ₹; an India visitor sees
₹ by default). Fall back to USD if geo is uncertain. Let the user override via a currency
switch in the pricing page header. Store the *display* currency; Lemon Squeezy handles the
actual charge currency (merchant-of-record, covers most global VAT/GST).

INR is **charm-priced locally, not FX-converted.**

| Tier | USD (non-India IP) | INR (India IP) |
|------|-------------------|----------------|
| Free | $0 | ₹0 |
| **Starter** *(featured)* | **$29/mo · $290/yr** | **₹1,499/mo · ₹14,990/yr** |
| Growth | $79/mo · $790/yr | ₹3,999/mo · ₹39,990/yr |

Rules:
- **Annual = pay for 10 months, get 12** (2 months free). Consistent across both currencies.
- Numbers are config. INR points are local charm (₹1,499 / ₹3,999), not spot conversion.
- Don't show both currencies at once — show one, offer the switch.
- Taxes: GST for INR; Lemon Squeezy as MoR covers most VAT/tax globally — confirm at build.

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
4. **Free callout** below, quiet: "Just trying it? Start free — 3 articles, no card."
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

The limit is visible everywhere, never sprung:
1. **Before upload** (dropzone): "3 free articles, then choose a plan."
2. **Account wall:** "free accounts include 3 articles, no card needed."
3. **Persistent counter** in KB chrome: "2 of 3 free articles left" — click opens upgrade
   (proactive path).
4. **At the limit** (reactive): article #4 attempt → upgrade modal naming the exact blocker.

Both paths land on the same modal (§7).

---

## 7. Upgrade modal copy

Fires reactively (hit the limit) or proactively (tapped the counter). Names the blocker,
leads with Starter, keeps hosting-is-the-value framing.

**Reactive (out of free articles):**
- **Badge:** "You've used your 3 free articles"
- **Heading:** "Keep building your help center"
- **Body:** "Your articles are ready to go live. Pick a plan to publish on your own domain,
  add your branding, and keep making guides — your whole team included, no per-seat fees."
- **Card:** Starter $29 (featured, "Most popular"); Growth as a secondary line. Currency
  auto-set by IP, monthly/annual toggle present, annual default.
- **Primary CTA:** "Start with Starter"
- **Reassurance:** "Cancel anytime. Your 3 articles stay yours."

**Proactive (tapped the counter, not yet blocked):**
- **Heading:** "Ready to go live?"
- **Body:** "You've got [N] of 3 free articles left. Upgrade any time to publish on your
  domain and keep the guides coming."
- Same card, no urgency badge (they aren't blocked — don't manufacture panic).

**30-day deletion nudge (free users approaching expiry):**
- **Heading:** "Your articles expire in [X] days"
- **Body:** "Free articles are removed after 30 days. Choose a plan to keep them live and
  on your domain." — the one place mild loss-aversion is fair, because it's true.

---

## 8. Design rules baked in

- **"/workspace not /seat" appears on every price** — it's the whole pitch.
- **Starter ($29) is visually dominant** on page and in modal.
- **Annual defaults on**, shown as per-month-equivalent + "2 months free."
- **One currency at a time**, IP-set, user-overridable.
- **Free is a callout, Growth is a line — neither is a full card at launch.**
- **No hard monthly wall on paid tiers** — soft top-up + infra circuit breaker.
- **All numbers are config** — this doc fixes the *structure*; month-one data sets *numbers*.

---

## 9. Open decisions

1. **Article/run top-up mechanics** — one-time pack vs. auto-overage vs. soft nudge. Resolve
   with usage data.
2. **INR charm points** — ₹1,499 / ₹3,999 are launch values; validate against early Indian
   signups.
3. **Free-tier unit** — 3 lifetime articles (locked) over "5 minutes."
4. **Promote Growth to a full card?** — decide after 60 days of PostHog run-cap + multi-KB
   demand data.
5. **Numbers overall** — leap-of-faith guesses per lean-startup; ship as config, correct in
   60 days.

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

| Tier | Runs | AI cost/mo (2-min avg) | Worst case (5-min, maxed) |
|---|---|---|---|
| Starter | 20 | $0.41 (₹36) | $0.73 (₹64) |
| Growth | 80 | $1.63 (₹144) | ~$2.90 |

### Unit economics per tier (after ~5% + $0.50 Lemon Squeezy MoR fee)

| Tier | Price | Net after fees | AI COGS | Gross profit | Margin |
|---|---|---|---|---|---|
| Starter | $29 | $27.05 | $0.41 | $26.64 | **92%** |
| Growth | $79 | $74.55 | $1.63 | $72.92 | **92%** |

The worst-case Starter customer still clears **91%**. No realistic usage pattern breaks the
margin — the run cap makes cost effectively bounded. This is the payoff of §3's runs-vs-
manual split.

### Fixed platform cost
~**$42/mo** total, shared across all customers (Render worker ~$7 + Supabase Pro ~$25 +
CDN/storage ~$10).

### Break-even & profit at scale (80% Starter / 20% Growth mix)

- **Break-even: ~2 Starter subscriptions.**
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
