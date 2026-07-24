# Quink — slice 1

Record a screen capture → get an editable, publishable help article inside your own
hosted help center. This repo is the first end-to-end slice: marketing landing → upload →
account wall → real Gemini pipeline → land inside a populated KB → full editor.

See `CLAUDE.md` for the locked product decisions and `ux-spec-v2.md` for the UX.

## The three pieces

| Piece | What it is | Runs on |
|-------|-----------|---------|
| **`web/`** | Vite + React SPA. Talks to Supabase directly for auth, reads, and editor saves. | `localhost:5173` |
| **`supabase/`** | Postgres schema + RLS + storage buckets (migrations). Auth, DB, Storage. | Supabase cloud |
| **`worker/`** | FastAPI pipeline worker — the ONLY custom backend. Owns Gemini + FFmpeg. | `localhost:8000` |

Only the worker is a custom backend; everything else is client ↔ Supabase.

---

## Prerequisites

- **Node** 18+ and npm (built on Node 24)
- **Python** 3.11+ (built on 3.13)
- **FFmpeg** on `PATH` (`ffmpeg -version`)
- A **Supabase** project, a **Gemini API key**, and Google OAuth configured (see below)

---

## One-time setup

### 1. Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. **Auth → Providers → Google**: enable it. Add a Google Cloud OAuth client and set the
   redirect URI to `https://YOUR-REF.supabase.co/auth/v1/callback`.
   (The email-link fallback also needs SMTP configured under Auth → Emails, or only Google
   sign-in will work.)
3. Apply the migrations (schema, RLS, storage buckets, triggers). From the repo root, with
   a DB connection string:
   ```bash
   npx supabase db push --db-url "postgresql://...session-pooler..." --include-all
   ```
   Get the connection string from **Project Settings → Database → Connection string (URI,
   Session pooler)**. Or paste each file in `supabase/migrations/` into the SQL editor in
   order (`0001` … `0007`).

Signing up auto-creates the user's `profiles` row, one `knowledge_bases` row (named from the
email domain, or "My Help Center" for free providers) and its free `{subdomain}.quink.site`.

`0007` makes the `frames` bucket public and adds a public `branding` bucket — the reader
site is anonymous and CDN-cached, so it reads screenshots and logos via public URLs (see the
note in `0007` on why this is safe for published content).

### 2. Worker env

```bash
cd worker
cp .env.example .env      # then fill it in
```
`.env` needs:
- `GEMINI_API_KEY` — from <https://aistudio.google.com/apikey>
- `SUPABASE_URL` — `https://YOUR-REF.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — **service role** key (Project Settings → API). Server-side
  only; it bypasses RLS. Never put it in the SPA.
- `ALLOWED_ORIGIN` — `http://localhost:5173`
- `DOMAIN_VERIFIER` — `stub` (default) drives custom-domain checks manually in dev;
  `vercel` is the real path and additionally needs `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`
  (see "Custom domain in production" below).
- `RESEND_API_KEY` / `EMAIL_FROM` — optional; unset, the domain-live email is only logged.

### 3. SPA env

```bash
cd web
cp .env.example .env.local   # then fill it in
```
`.env.local` needs (both are PUBLIC — they ship in the browser bundle):
- `VITE_SUPABASE_URL` — same project URL
- `VITE_SUPABASE_ANON_KEY` — the **anon / publishable** key (NOT the service role key)
- `VITE_WORKER_URL` — `http://localhost:8000`

### 4. Install dependencies

```bash
# Worker
cd worker
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

# SPA
cd ../web
npm install
```

---

## Running it

Two terminals. Start both; open the SPA in a browser.

**Terminal 1 — pipeline worker**
```bash
cd worker
.venv/Scripts/python -m uvicorn main:app --port 8000     # Windows
# .venv/bin/python -m uvicorn main:app --port 8000        # macOS/Linux
```
Health check: <http://localhost:8000/health> → shows the two model IDs.

**Terminal 2 — SPA**
```bash
cd web
npm run dev
```
Open <http://localhost:5173>.

To reload the worker after code changes, stop it (Ctrl-C) and start it again. Add
`--reload` to the uvicorn command for auto-reload during development.

---

## Trying the full flow

1. **Marketing home** → "Build my article".
2. Drop an **MP4/MOV** (screen recording), set the product name, "Build my article".
3. **Account wall** → Continue with Google.
4. Watch the four real pipeline stages, then land inside your help center with article #1.
5. Open the article → edit text (autosaves), reorder/merge/split steps, repair screenshots
   with the tiered frame-picker.

Returning users click **Log in** on the home page and land straight in their KB — no upload.

---

## The help center: theming · sharing · reader site · custom domain

Seed demo data first so every flow has something to show (needs one signed-up user — a KB
auto-provisions on signup):

```bash
python supabase/seed.py     # sets a theme + one article in each publish state
```

**Reader site (public, anonymous).** In dev the subdomain is simulated by a path:

```
http://localhost:5173/kb/{subdomain}          → first listed article
http://localhost:5173/kb/{subdomain}/{slug}   → one article
?kb={subdomain}                                → redirects into /kb/{subdomain}
```

The seed KB's subdomain is printed by `seed.py` (e.g. `my-help-center`). From the KB screen,
**View site ↗** opens it. Drafts 404; unlisted articles resolve by direct link but never
appear in the nav, search or sitemap; `⌘K` searches listed articles. All reader reads go
through anon `reader_*` RPCs — base-table RLS is fully closed to anon.

**Theming** (KB rail → **Theme**): a live split-preview that renders the real reader
component. Pick a preset or paste a hex; nav, links and step rails all move from that one
colour. Save is confirmation only. The favicon is derived from the logo automatically.

**Sharing** (in the editor): the slug is editable while `draft` and frozen on publish. The
**Copy link** button is disabled while draft and, once published, copies the URL and states
the access level (and the 30-day expiry on free tier). Toggle **Listed / Unlisted** to
control whether it appears in the help center.

**Custom domain** (KB rail → **Domain**), with `DOMAIN_VERIFIER=stub`. Custom domains are a
**paid feature** (pricing-spec §Free: "No custom domain"), but the gate is **off** until
checkout ships — flip `DOMAIN_REQUIRES_PAID_PLAN` in `worker/config.py` when payments land
and free KBs start getting a 402 with the reason in the form's error slot. Any plan can
connect a domain until then. To drive every state locally with no Vercel account and no real
DNS:

1. Enter a domain (e.g. `docs.acme.com`) → **Connect**. State → `pending`; the DNS records
   appear (Type / Host / Value / TTL, each independently copyable). Reload the page — they
   are re-fetched, not lost.
2. Click **⚙ Simulate DNS (dev)** — this tells the stub the domain now resolves, then
   re-checks. State → `verifying` → `live`. (An email-on-live is logged by the worker.)
3. **Check again** without simulating keeps it in `verifying`; after `DOMAIN_MAX_ATTEMPTS`
   it goes `failed`. **Remove domain** returns it to `none`.

The free `{subdomain}.quink.online` stays live throughout — adding a custom domain never
takes the KB offline. A background loop in the worker also re-checks `pending`/`verifying`
domains on a backoff and emails on success, so leaving the page doesn't abandon the task.
Once a domain is live the reader redirects the subdomain to it and emits a `canonical` link,
so the two addresses don't compete in search.

Checks: `python domain.py` (record/backoff logic) and `python test_domain_api.py` (the
endpoint guard order — the reserved-host check and the paid wall must both run *before*
anything is registered with the hosting provider; the test covers the wall in both
positions, so flipping it on later is already verified).

### Custom domain in production

Pointing DNS at us is only half of it. Vercel serves the SPA, so it is also what routes the
customer's hostname and issues its TLS certificate — **a host Vercel doesn't know about 404s
with no certificate**, so a perfectly correct CNAME still gives the reader a browser security
error. The worker therefore registers each connected domain on the Vercel project and then
asks Vercel when it's servable (rather than doing its own CNAME lookup, which can say "yes"
while the cert is still missing). To turn it on:

1. Create a Vercel token with access to the SPA project → `VERCEL_TOKEN`.
2. Project → Settings → General → Project ID → `VERCEL_PROJECT_ID` (plus `VERCEL_TEAM_ID`
   on a team account).
3. Set `DOMAIN_VERIFIER=vercel`. The worker fails at startup if the first two are missing,
   rather than accepting domains that could never go live.

`supabase/migrations/0012_domain_attempts.sql` is already applied to the linked project
(the attempt counter moved out of worker memory; without the column every check errors) —
re-run it on any other environment before deploying there.

The worker serves `GET /reader/{subdomain}/sitemap.xml` (listed articles only; empty for
free-tier KBs, which also render `noindex`).

## Config you may want to change

- **Model IDs, limits, copy** live in named constants — never scattered literals:
  - Worker: `worker/config.py`, prompts in `worker/prompts.py`
  - SPA: `web/src/lib/config.ts`
- Free tier is `FREE_ARTICLE_LIMIT` (3 lifetime articles). Display-only this slice — no
  enforcement yet.

---

## Known gaps in this slice (by design or flagged)

- **Frame-picker Tier 2 (full-video scrub) needs a browser-safe proxy.** It loads the raw
  uploaded video into a `<video>`. Real recordings can be encoded at H.264 level 6.2 /
  high fps, which desktop browsers refuse to decode. The worker should emit a downscaled
  H.264 Main@≤4.0 / 30fps / faststart proxy for scrubbing. Tiers 0/1/3 are unaffected.
- **No delete-on-publish source-video cleanup.** Deleting an article removes its DB rows
  (steps cascade) and best-effort removes its frames + source video from Storage. Logos
  abandoned before Save on the Theme screen are still orphaned — minor.
- **Custom domains default to the stub** (`DOMAIN_VERIFIER=stub`) so the flow is drivable
  locally. Production is `vercel` + `RESEND_API_KEY` — see "Custom domain in production".
  Remaining sharp edge: the subdomain→custom-domain redirect happens in the reader
  (client-side `location.replace` + a `canonical` link), not as an edge 301. Fine for
  readers and for search, but it costs one round trip on the old address.
- **Ownership challenges are surfaced but untested against a live conflict.** If the apex is
  already claimed on another Vercel account, Vercel returns a TXT challenge; we show it
  alongside the routing record and re-verify on each check. The 409 ("already connected to
  another site") path is the one that's exercised.
- **Deferred (schema holds them, no UI): payments, quota enforcement, folders/categories,
  multiple KBs per account, per-KB analytics (`reader_views` column exists, not yet bumped).**

## Evals

The prompt in `worker/prompts.py` is reconstructed from the specs, not the harness's exact
bytes, and adds unmeasured PII/injection guards — so it is NOT comparable to the
`2026-07-15-*` eval runs. Re-baseline per `EVAL-PLAN.md` before reading any score against
those numbers. See `Learnings.md` (esp. #6 on run-to-run variance) before iterating.
