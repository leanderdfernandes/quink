# ENVIRONMENTS.md — production and staging

Two environments. There is no local or dev tier: a developer's machine runs `staging`
values against the staging project, which is why the boot checks treat "not production"
as one case.

**This file is the drift ledger.** If a row is wrong, the environment is not trustworthy —
the whole point of staging is that a thing proven there is proven for production, and that
only holds while the two differ in exactly the ways written down here. Update the table in
the same commit that changes a variable.

Secrets are listed by name with their value as `set` / `unset`. Never write a value here.

---

## The switch

`APP_ENV` (worker) and `VITE_APP_ENV` (web) are the single source of truth for "which
deployment is this". Both are **required with no default**, and both refuse rather than
guess: `worker/config.py` reads `os.environ["APP_ENV"]` at import, `web/src/lib/config.ts`
throws at module load, and `web/vite.config.ts` fails the build. A deployment that had to
infer its own identity from a hostname or an origin list is a deployment that will one day
infer it wrong.

`worker/main.py:_assert_env_coherent()` runs once at startup, before anything else in the
lifespan, and refuses to boot on:

| Condition | Why it is fatal rather than a warning |
|---|---|
| `APP_ENV` unset or not `production` / `staging` | Everything below keys off it |
| non-production and `EMAIL_REDIRECT_TO` unset | A staging sweep could mail a real customer |
| production and `EMAIL_REDIRECT_TO` set | Every customer email silently lands in one inbox |
| non-production and a `RAZORPAY*` value starts with `rzp_` but not `rzp_test_` | A live key takes a real payment |
| non-production and `DAILY_SPEND_CAP_USD` > 2 | Staging bills the same Gemini account |

Proven by `worker/test_env.py` (`python test_env.py` inside `worker/`).

---

## Worker (Render) — `worker/config.py`

| Variable | Purpose | Production | Staging |
|---|---|---|---|
| `APP_ENV` | The switch. Required, no default. | `production` | `staging` |
| `GEMINI_API_KEY` | Stage 1 + Stage 2 model calls | set | set — **same key**, so staging spends real money; that is what the $2 cap is for |
| `SUPABASE_URL` | Which database | production project | staging project |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses all RLS | set | set |
| `ALLOWED_ORIGIN` | CORS allow-list, and the source of email links | `https://quink.online,https://www.quink.online` | the staging SPA origin |
| `DOMAIN_VERIFIER` | `vercel` (real) or `stub` (driven by hand) | `vercel` | `stub` — see "Custom domains" below |
| `VERCEL_TOKEN` | Registers customer domains | set | unset (stub mode) |
| `VERCEL_PROJECT_ID` | The SPA project domains attach to | set | unset (stub mode) |
| `VERCEL_TEAM_ID` | Team accounts only | unset (personal account) | unset |
| `DOMAIN_CHECK_INTERVAL_SECONDS` | Re-check cadence floor | `60` | `60` |
| `RESEND_API_KEY` | Outbound mail provider | set | set |
| `EMAIL_ENABLED` | Kill switch; a real send needs this **and** the key | `true` | `true` — staging is where the trial templates finally send |
| `EMAIL_REDIRECT_TO` | Catch-all; every message goes here instead | **unset** (refused if set) | set to one operator address (**required**) |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | Both a real monitored mailbox | `support@quink.online` | same |
| `SUPPORT_EMAIL` | The one support address | `support@quink.online` | same |
| `DAILY_SPEND_CAP_USD` | Global Gemini circuit breaker | unset → `5.0` | `2` (boot refuses above 2) |
| `TELEGRAM_BOT_TOKEN` | Operator alerts | set | unset — `notify_ops()` logs at WARNING instead |
| `TELEGRAM_CHAT_ID` | Operator alerts | set | unset |
| `OPENAI_API_KEY` | Not used by the worker — the **eval judge** borrows this venv and `.env` | unset on Render | unset on Render |

## Web (Vercel) — `web/src/lib/config.ts`

Both Supabase values ship in the browser bundle. That is expected: the anon key grants only
what RLS allows. All three are inlined at **build** time, so changing one in Vercel takes
effect on the next build, not on the running deployment.

| Variable | Purpose | Production | Staging |
|---|---|---|---|
| `VITE_APP_ENV` | The switch; also decides the STAGING bar | `production` | `staging` |
| `VITE_SUPABASE_URL` | Which database the SPA talks to | production project | staging project |
| `VITE_SUPABASE_ANON_KEY` | Public key, RLS-scoped | set | set |
| `VITE_WORKER_URL` | The FastAPI worker origin | the production Render service | the staging Render service |

## Not variables — worth knowing they are shared

- **`GEMINI_API_KEY` is the same account in both environments.** Staging generations cost
  real money. `DAILY_SPEND_CAP_USD=2` is the only thing between a runaway staging loop and
  a production bill.
- **Resend sends from the same verified domain in both.** `EMAIL_REDIRECT_TO` is what keeps
  a staging send off a customer's doorstep, not a separate sending domain.
- **Storage bucket names are identical** (`videos`, `frames`, `branding`). They live in
  different projects, so there is no collision — but a service-role key pasted into the
  wrong environment reaches real objects immediately.

---

## Custom domains on staging

`DOMAIN_VERIFIER=stub` there, deliberately. The stub hands out DNS records that do not
resolve, and `domain._refuse_if_serving_real_users()` refuses to issue them **in production
only** — the check keys off `IS_PRODUCTION`, not off whether an origin looks deployed, so
staging can drive every state transition by hand through `POST /api/domain/stub` with no
Vercel account and no DNS.

---

## Two operational constraints

### Render idles the service, which stops every sweep

`domain.run_loop()` is a single asyncio task started from the FastAPI lifespan. It is the
only driver of **four** sweeps: the domain re-check, `retention.sweep_timeouts()`,
`retention.sweep()` (failed-video retention) and `trial.sweep()` (the day-14/7/offline/purge
lifecycle). No cron, no scheduler — when the process is not running, none of them run.

Render's free tier spins an instance down after ~15 minutes with no inbound request, and a
cold start takes ~a minute. So a staging worker left alone overnight has run no sweeps, and
the trial fixture will not have gone offline by morning. **This is not a bug to work
around**: every sweep is a state query ("free, past expiry, not yet offline"), never a
scheduled event, so a missed tick self-heals on the next boot and running one twice is
harmless (CLAUDE.md §10f).

To force a tick by hand rather than wait for one:

```bash
cd worker
.venv/Scripts/python -c "import trial;     print(trial.sweep())"        # trial lifecycle
.venv/Scripts/python -c "import retention; print(retention.sweep())"    # failed-video purge
.venv/Scripts/python -c "import retention; print(retention.sweep_timeouts())"
.venv/Scripts/python -c "import domain;    domain.sweep()"              # custom domains
```

Each returns how many rows it acted on. Point `worker/.env` at the **staging** project
first — these run with the service role key and do not ask which database they are in.

Waking the service with a request (`GET /health`) also works and is the lazier option when
you only need the loop running again.

### Supabase pauses free projects

A free Supabase project is paused after prolonged inactivity — roughly a week untouched.
Nothing recovers from that automatically: the staging worker's Supabase calls fail and the
SPA cannot sign anyone in. **Resume it by hand from the Supabase dashboard**
(project → Restore/Resume); it takes a few minutes and the data is intact.

If you resume a paused project and the fixtures look wrong, re-run `db/seed.sql` — it is
re-runnable by design.

---

## Standing up staging from scratch

1. New Supabase project. Apply `supabase/migrations/0001…N` **in order**, from empty.
   Never restore a production dump — see CLAUDE.md, "Staging is replayed, never restored".
2. Create the seed guard by hand, in the staging project only:
   `create table public.staging_marker (note text);`
   It is deliberately not in any migration, so it can never reach production.
3. Run `db/seed.sql`.
4. New Render service on the staging branch, with the worker table above.
5. Vercel: the staging branch's environment gets the web table above.
6. Add the staging SPA origin to the Supabase redirect allowlist, including `/claim/*`
   and `/invite/*` (CLAUDE.md §10d — with only the Site URL allowed, OAuth drops the
   token and the user lands on an empty app).
