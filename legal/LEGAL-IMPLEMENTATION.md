# LEGAL-IMPLEMENTATION.md

Instructions for shipping the four legal pages. Read this before touching the markdown.

The four documents are `privacy-policy.md`, `terms-and-conditions.md`,
`refunds-and-cancellation.md`, `contact.md`.

---

## 1. Fill these before publishing

There are exactly five placeholders across the four files. Nothing else is a blank.

| Placeholder | Appears in | Note |
|---|---|---|
| `[PROPRIETOR LEGAL NAME]` | all four | Name as it appears on the Udyam registration and the current account. Must match what Razorpay has, or activation bounces. |
| `[BUSINESS ADDRESS]` | privacy, terms, contact | Required by the DPDP Rules and by IT Rules 2021 for a Grievance Officer. Home address or virtual office — decide before publishing, because it also goes to Razorpay and to the Google OAuth consent screen. |
| `[UDYAM NUMBER]` | contact | Optional but it makes the business look real to a first customer. |
| `[EFFECTIVE DATE]` / "13 August 2026" | all four | Change if you publish on a different day. |

---

## 2. Where they go

Static routes on the marketing site at `quink.online` — off the KB, deliberately: these
URLs are read by reviewers who never sign in, and a route inside the app is a route behind
auth.

```
/privacy      → privacy-policy.md
/terms        → terms-and-conditions.md
/refunds      → refunds-and-cancellation.md
/contact      → contact.md
```

**These are not articles and must never live in a knowledge base.** They cannot be one
accidental article-delete away from disappearing, and the Google OAuth consent screen needs
a stable URL.

**They must never be `noindex`.** Google's OAuth verification and Razorpay's activation
review both fetch these URLs directly. Whatever noindex logic exists for reader sites and
demo KBs must not apply to these routes.

Link all four from the footer of the marketing site, the app, and every published help
center. Razorpay's reviewer looks for footer links, not just direct URLs.

Render markdown to HTML at build time. Do not fetch and parse at runtime — these pages must
work when the worker is down.

---

## 3. Pre-publish truth checks

Every claim below is a factual statement about the system. If any is false at publish time,
the fix is to change the code or change the sentence, not to publish and hope. Verify each.

- [ ] **Gemini paid tier is active on the production key.** The "not used to train Google's
      models" claim in privacy §4 depends entirely on this. It was still open at launch —
      confirm it directly in the Google Cloud console, not from memory.
- [ ] **Re-read Google's current paid-tier API terms** and confirm the no-training language
      still holds. Privacy §4 is the highest-risk paragraph in the document set.
- [ ] **Subprocessor regions are correct.** I wrote Supabase and Render as Singapore, Resend
      as US, ImprovMX and PostHog as EU. **These are assumptions — check each provider's
      actual region setting in your dashboard** and correct the table in privacy §6.
- [ ] **Email provider is right.** The table says ImprovMX for inbound; the launch plan said
      Cloudflare Email Routing, and the two were never reconciled. Check which is actually
      running and make the table match. (`OPEN-ITEMS.md` records mx1/mx2.improvmx.com as the
      live answer — verify, then delete this box.)
- [ ] **PostHog is installed in cookieless mode**, or privacy §7's "no cookie banner" claim
      is not yet true — and it has never been ticked. Either ship cookieless PostHog first,
      or soften §7 until you do. Do not publish the stronger version early.
- [ ] **Self-serve account deletion is live and matches privacy §11** — permanent, no PITR,
      paid plans refused, jobs rows anonymised, confirmation email sent.
- [ ] **Free-tier day 30 / day 37 behaviour matches** terms §3 and privacy §5, including the
      14-day, 7-day and offline emails actually sending. **The four trial templates have
      never sent a real message** — that was flagged before launch and is still unverified.
- [ ] **Source video retention matches what the policy promises.** Publishing no longer
      collects the recording at all (CLAUDE.md §10f, migration 0041); the window is
      `PLANS[plan]["video_retention_days"]`, and failed jobs purge on
      `FAILED_VIDEO_RETENTION_DAYS`. Privacy §5 must state the window this code enforces,
      not the delete-on-publish behaviour it replaced.
- [ ] **Refund terms are what you actually want.** 7-day money-back on first payment, no
      renewal refunds, no refund for spent generations. Change the numbers if you disagree —
      this is the one document where the terms are a business decision, not a description.
- [ ] **GST.** Terms §11 says "taxes are added where applicable." If you are not GST
      registered, that is accurate and needs no change. Once you register, prices and
      invoices need to state GST explicitly — revisit then.

---

## 4. Demo help center rules (internal — do not publish this section)

Terms §9 makes public commitments about reverse demos. These are the operating rules that
make those commitments true. Breaking them turns a marketing tactic into a legal problem.

1. **Every unclaimed demo KB is `noindex` and `visibility != 'listed'`.** A competitor's
   product documentation ranking on your domain is the fastest way to a cease-and-desist.
2. **Nothing recorded beyond what a trial user sees.** No customer data of theirs, no admin
   panels, no anything behind a paywall you didn't pay for.
3. **No implication of endorsement.** The demo says "built by Quink," never "official."
4. **Same-day takedown, no argument, no reply-to-object.** Terms §9 promises this in writing.
   Wire a takedown to a hard delete, not a hide.
5. **Purge unclaimed demos on the same day-37 schedule as free KBs.** An indefinite archive
   of other companies' product screenshots is not a thing you want to be holding.

Verify §9's claims against how demo KBs actually behave today. If they are currently indexed
or listed, fix that before publishing the terms, not after.

---

## 5. Do not change

- The retention numbers in privacy §5 and terms §3 — 30 days, day 37, 7 days for failed-job
  videos. They describe shipped behaviour. If you want different numbers, change the code
  first and the documents second.
- The "no PITR / no backup / permanent" language in privacy §11 and §13. It is unflattering
  and it is true, and it matches the deletion dialog copy.
- The admin-access disclosure in privacy §9. Required, not optional: admin sessions can
  WRITE inside a customer's help center (CLAUDE.md §10c), so the policy has to say so.
- The jobs-anonymisation and billing-retention carve-outs in privacy §11. They must stay
  aligned with the delete-account implementation. If that implementation changes, this
  paragraph changes with it.
- The liability cap and governing law in terms §13 and §16.

---

## 6. Before you finish

- [ ] All four routes return 200 and render correctly on mobile.
- [ ] All four are linked in the marketing site footer, the app footer, and published help
      center footers.
- [ ] `curl` each URL and confirm no `noindex` meta tag and no `X-Robots-Tag` header.
- [ ] Privacy Policy URL added to the Google OAuth consent screen.
- [ ] All four URLs submitted to Razorpay for activation review.
- [ ] Every placeholder from §1 replaced. Grep for `[` across the four files — zero hits.
- [ ] Every box in §3 ticked, or the corresponding sentence softened to something true.
- [ ] Tell me anything in these documents that contradicts `pricing-spec.md`,
      `OPEN-ITEMS.md`, `OPERATIONS.md` or the shipped code. **Do not silently reconcile
      it** — list the contradictions and let me decide.

---

## 7. Log in LEARNINGS.md

- Legal pages are a fourth place specs can drift from code. "Copy and specs written ahead of
  implementation, then implementation diverged" is a recurring pattern here with at least
  four recorded instances. A published privacy policy is the most expensive
  version of that failure, because the drift is a written promise to a stranger.
- Any change to retention, deletion, subprocessors, or admin access now has a documentation
  dependency. Add a line to `CLAUDE.md`: **if you change what data we keep, who touches it,
  or how long we keep it, the privacy policy changes in the same commit.**
