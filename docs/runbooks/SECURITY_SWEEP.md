# Security sweep (P3.5, closes N6 and N9)

What the sweep changed, what is still open, and the steps only the owner can do.
Every code item has a test; every non-code item has a click path or command below.

## 1. Status per plan item

| Plan item | Status | Evidence |
|---|---|---|
| CORS allow-list (web origin only) | Done | `security/plugins.ts` `registerSecurity`: one exact origin, trailing slash in `FRONTEND_URL` normalised, never `*`. `plugins.test.ts` |
| Security headers on the api | Done | Helmet with a strict JSON-API CSP (`default-src 'none'`, `frame-ancestors 'none'`). `plugins.test.ts` |
| Body size limit on `/chat` and tRPC | Done | 1 MiB default, **4 MiB on `/chat`** (under Vercel's 4.5 MB request cap). `plugins.test.ts`. Adjustable: `CHAT_BODY_LIMIT_BYTES` |
| Zod limits on every free-text field | Done for the api routers; **not** for legacy web REST routes (section 2) | `security/limits.ts`, `input-bounds.test.ts`, `chat.schema.test.ts` |
| Admin 2FA enforced | Code done, **flag off by default**. The 8 legacy REST admin routes that bypassed it are deleted | `security/admin-2fa.ts`, `admin-2fa.test.ts`, `rest-admin-guard.test.ts` |
| Login rate limit shared across instances | Code done (`storage: "database"`, migration 0019). **Apply 0019 before deploying** (owner step 2) | `packages/db/src/schema/rate-limit.ts`, `0019_auth_rate_limit.sql`, `auth-rate-limit.service.test.ts` |
| Turnstile live | **Cannot be confirmed from code.** Owner step 5 | section 2, item C |
| Dependabot + `pnpm audit` failing on high | Done | `.github/dependabot.yml`, `.github/workflows/security-audit.yml` |
| Branch protection on `main` | **Owner step 7** | GitHub setting, no code |
| Logs contain no message content or tokens | Done (tripwire + redaction) | `security/log-scan.ts`, `log-hygiene.test.ts`, `LOG_REDACT` in `plugins.ts` |
| N9 `/metrics` unauthenticated | Done | `METRICS_TOKEN` Bearer; unset in production = 404. `plugins.test.ts` |
| `db-ops.yml` reset / seed on production | Done (added during the sweep) | guards in `db-ops.yml`, `db-migrate.yml`, `packages/db/src/seed.ts` |

## 2. Frozen-zone exceptions (owner-approved 2026-09-30) and what is still open

**A. Done: the eight legacy admin REST routes are deleted.**
`apps/web/app/api/admin/**` (users, users/[id], users/[id]/credits, stats, fraud, fraud/[id]/resolve, logs, codes) checked only `role`, so they bypassed the 2FA gate. A repo-wide search found no caller (only comments and docs). Every one has a tRPC equivalent (`getDashboardStats`, `listFraudEvents`, `resolveFraudEvent`, `listUsageLogs`, `generateCodes`, `listUsers`, `getUserDetail`, `updateUserStatus`, `adjustCredits`), and the credits route was also non-atomic. `rest-admin-guard.test.ts` fails if the directory returns, or if any web route tests for the admin role without calling `checkAdminTwoFactor`.

**B. Done: the login rate limit is now shared.** `apps/web/lib/auth.ts`: `rateLimit: { window: 60, max: 5, storage: "database" }`, plus the `rateLimit` model in the adapter schema. The counters live in the new `rate_limit` table (`0019_auth_rate_limit.sql`, RLS on, no policies); the api prunes rows older than a day every night at 03:30 (`pruneAuthRateLimit`). Costs and risks, stated plainly:
- **Deploy order is critical.** If the web deploy goes out before the table exists, every `/api/auth/*` request errors: a login outage. Apply 0019 first (step 2).
- Every auth request now does a small read and write on Postgres.
- The limit was never tested against real multi-instance traffic, and I could not confirm which auth paths better-auth counts (it keys per client IP and path). Watch for legitimate 429s after deploy (step 2 check). Rollback: revert the one `rateLimit` line in `auth.ts`; the table is harmless to leave.

**C. Still open: Turnstile does nothing unless `TURNSTILE_SECRET_KEY` is set on Vercel Production.**
`verifyTurnstileToken` returns success when the secret is missing (documented in `turnstile-server.ts`). It gates sign-up and redeem only. Config check, step 5.

## 3. Owner steps, in this order

1. **Check for the seed backdoor first.** `seed.ts` creates a superadmin `admin@localhost.dev` with the fixed password `Admin123!` and 100,000 credits, and `db-ops.yml` `all` / `seed` / `reset-and-migrate-all` ran it against `DATABASE_URL`. In the Supabase SQL editor:
   ```sql
   select id, email, role, created_at from users where email like '%@localhost.dev';
   ```
   If any row exists on production: log in as your real admin, enrol 2FA, then delete or disable those rows (or change their passwords) **before anything else**. If you promoted `admin@localhost.dev` to be your real admin, create a proper account and retire it.
2. **Apply migration 0019 BEFORE merging/deploying.** Supabase SQL editor: paste the contents of `packages/db/src/migrations/0019_auth_rate_limit.sql` and run it (or Actions > DB Operations > `constraints`, which now includes 0019). Verify: `select count(*) from rate_limit;` returns 0 without an error. Only then merge the PR (PR first; Render and Vercel build `main` without waiting for CI). After the deploy: sign in normally, then try 6 wrong passwords quickly for a throwaway account; the sixth should get 429. Confirm `select key, count from rate_limit order by last_request desc limit 5;` shows rows. Then browse the site for a few minutes: no unexpected 429s.
3. **Enrol 2FA on every admin** (Settings > Security, authenticator app). Then verify in Supabase:
   ```sql
   select email, role, two_factor_enabled from users where role in ('admin','superadmin') order by email;
   ```
   Every row must say `true`. (better-auth should set it only after you confirm the first code; if a row stays `false` after enrolling, stop and send me the row.)
4. **Set `ADMIN_REQUIRE_2FA=true` on BOTH Render (api) and Vercel (web)** and redeploy both. It must be both, because `adminProcedure` runs in the api and inside the web app. Then open `/admin` and confirm the dashboard loads. A non-enrolled admin now gets `ADMIN_2FA_REQUIRED` (the UI shows a generic error until the frontend maps that code: follow-up).
5. **Turnstile check.** Vercel > Project > Settings > Environment Variables: `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` exist for **Production**. If the secret was missing, add it and redeploy. Test with a throwaway address you control:
   `curl -i -X POST https://YOUR-WEB/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: https://YOUR-WEB' -d '{"email":"you+turnstile@example.com","password":"Aa1aaaaa","name":"t"}'`
   Expect a 4xx. A 200 means Turnstile is off: delete that user in Supabase and fix the secret.
6. **Set `METRICS_TOKEN`** on Render (api), 24+ random characters (`openssl rand -hex 32`), redeploy. Check: `curl -i https://YOUR-API/metrics` gives 401 (or 404 before the token is set); `curl -i -H "Authorization: Bearer $METRICS_TOKEN" https://YOUR-API/metrics` gives 200. Nothing in this repo scrapes `/metrics`; if you added an external scraper, give it the header.
7. **Branch protection.** GitHub > repo > Settings > Branches > Add branch ruleset (or classic rule) for `main`: require a pull request (0 approvals is fine when you work alone); require status checks `API Tests (Testcontainers)`, `Web Build (next build)`, `Type-check & Lint`, `API Docker Image`; require branches to be up to date. Do **not** make `Security Audit` required (a fresh advisory would block the PR that fixes it). The check names only appear in the picker after they have run once. Verify: open a PR with a failing check and confirm Merge is disabled. In Render, set auto-deploy to *After CI Checks Pass*.
8. **GitHub Settings > Advanced Security:** enable Dependabot alerts and Dependabot security updates (secret scanning + push protection came in P3.4). Optionally create a GitHub Environment `production` with yourself as required reviewer for the DB workflows.

## 4. Break-glass

- **Login broken right after a deploy (500 on `/api/auth/*`):** migration 0019 was not applied. Run it (step 2); or revert the `rateLimit` line in `apps/web/lib/auth.ts`.
- **Real users get 429 on login/session calls:** raise `max` or shorten `window` in `apps/web/lib/auth.ts` `rateLimit`, or add `customRules` for the affected path.
- **Locked out of `/admin`:** unset `ADMIN_REQUIRE_2FA` (empty or delete) on Render **and** Vercel, redeploy both. Do not edit `two_factor_enabled` by hand.
- **`/chat` returns 413 for a real user:** raise `CHAT_BODY_LIMIT_BYTES` in `security/plugins.ts` (keep it under 4.5 MB while Vercel proxies the request).
- **A log line was flagged by `log-hygiene.test.ts`:** remove the value from the call. If it is reviewed and safe, add `// log-ok: <reason>` on the call line.
- **A dependency advisory blocks `Security Audit`:** merge the Dependabot PR; if no fix exists, add the advisory to `pnpm.auditConfig.ignoreCves` in the root `package.json` with a dated comment in the PR.

## 5. Destructive database tasks

`db-ops.yml` `reset` / `reset-and-migrate-all` and `db-migrate.yml` `reset-and-migrate` now stop when `public.users` has any row (no override). To wipe a populated database, take a backup, then run `DROP SCHEMA` by hand in the Supabase SQL editor. `seed.ts` refuses when the database has users other than the two seed accounts (`ALLOW_SEED_ON_NONEMPTY=1` overrides, local throwaway only). Seed models with `seed:models`, never `seed`, on production.

## 6. Known limits

- The log scanner is a tripwire, not proof: it cannot follow a sensitive value renamed on the way into a log call.
- The 4 MiB `/chat` body is parsed before authentication, so an unauthenticated caller can make the api read up to 4 MiB per request. Render's edge and the `/chat` rate limit bound the rate, not the size.
- Frozen web routes (`redeem`, `delete-account`, `export-data`) keep their own input handling and the older synchronous per-process rate limiter.
- Auth rate-limit rows are pruned once a day; between prunes the table holds one row per client IP and auth path seen that day.
