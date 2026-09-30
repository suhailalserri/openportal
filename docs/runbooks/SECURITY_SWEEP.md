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
| Admin 2FA enforced | Code done, **flag off by default**; see the REST bypass in section 2 | `security/admin-2fa.ts`, `admin-2fa.test.ts` |
| Login / registration limits and Turnstile live | **Cannot be confirmed from code.** Owner checks 4 and 5 | see section 2, items B and C |
| Dependabot + `pnpm audit` failing on high | Done | `.github/dependabot.yml`, `.github/workflows/security-audit.yml` |
| Branch protection on `main` | **Owner step 7** | GitHub setting, no code |
| Logs contain no message content or tokens | Done (tripwire + redaction) | `security/log-scan.ts`, `log-hygiene.test.ts`, `LOG_REDACT` in `plugins.ts` |
| N9 `/metrics` unauthenticated | Done | `METRICS_TOKEN` Bearer; unset in production = 404. `plugins.test.ts` |
| `db-ops.yml` reset / seed on production | Done (added during the sweep) | guards in `db-ops.yml`, `db-migrate.yml`, `packages/db/src/seed.ts` |

## 2. Open findings that need your decision (frozen zone, not touched)

**A. Eight legacy admin REST routes bypass the 2FA gate.**
`apps/web/app/api/admin/{users,users/[id],users/[id]/credits,stats,fraud,fraud/[id]/resolve,logs,codes}/route.ts`
check only `role` (plus the account guard). Nothing in `apps/web` outside `app/api` calls them (searched). One of them adjusts credits.
So while they exist, "admin 2FA enforced" is not true: a session for an admin without 2FA can still use them.
Recommended: **delete all eight** (dead code). Fallback: in each, after the role check, add
`if (!checkAdminTwoFactor(session.user).ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })`
with `import { checkAdminTwoFactor } from "@ai-platform/api/security/admin-2fa"` (the export is already added to `apps/api/package.json`).
They also have unbounded `reason` strings. This needs your approval as a logged frozen-zone exception.

**B. Login rate limit is probably per instance.** `apps/web/lib/auth.ts` line 325: `rateLimit: { window: 60, max: 5 }`, no storage option.
As I understand better-auth the default is process memory, so on Vercel every serverless instance counts separately and the limit is weak.
Not verified. Fix (needs the exception): `rateLimit: { window: 60, max: 5, storage: "database" }` (needs better-auth's `rateLimit` table) or `secondaryStorage` backed by Upstash.

**C. Turnstile does nothing unless `TURNSTILE_SECRET_KEY` is set on Vercel Production.**
`verifyTurnstileToken` returns success when the secret is missing (documented in `turnstile-server.ts`). It gates sign-up and redeem only.

## 3. Owner steps, in this order

1. **Check for the seed backdoor first.** `seed.ts` creates a superadmin `admin@localhost.dev` with the fixed password `Admin123!` and 100,000 credits, and `db-ops.yml` `all` / `seed` / `reset-and-migrate-all` ran it against `DATABASE_URL`. In the Supabase SQL editor:
   ```sql
   select id, email, role, created_at from users where email like '%@localhost.dev';
   ```
   If any row exists on production: log in as your real admin, enrol 2FA, then delete or disable those rows (or change their passwords) **before anything else**. If you promoted `admin@localhost.dev` to be your real admin, create a proper account and retire it.
2. **Deploy this change** (PR first; Render builds `main` without waiting for CI). The api logs warnings at boot about `ADMIN_REQUIRE_2FA` and `METRICS_TOKEN`; both are expected until steps 3 and 6.
3. **Enrol 2FA on every admin** (Settings > Security, authenticator app). Then verify in Supabase:
   ```sql
   select email, role, two_factor_enabled from users where role in ('admin','superadmin') order by email;
   ```
   Every row must say `true`. (better-auth should set it only after you confirm the first code; if a row stays `false` after enrolling, stop and send me the row.)
4. **Turnstile check.** Vercel > Project > Settings > Environment Variables: `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` exist for **Production**. If the secret was missing, add it and redeploy. Test with a throwaway address you control:
   `curl -i -X POST https://YOUR-WEB/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: https://YOUR-WEB' -d '{"email":"you+turnstile@example.com","password":"Aa1aaaaa","name":"t"}'`
   Expect a 4xx. A 200 means Turnstile is off: delete that user in Supabase and fix the secret.
5. **Set `ADMIN_REQUIRE_2FA=true` on BOTH Render (api) and Vercel (web)** and redeploy both. It must be both, because `adminProcedure` runs in the api and inside the web app. Then open `/admin` and confirm the dashboard loads. A non-enrolled admin now gets `ADMIN_2FA_REQUIRED` (the UI shows a generic error until the frontend maps that code: follow-up).
6. **Set `METRICS_TOKEN`** on Render (api), 24+ random characters (`openssl rand -hex 32`), redeploy. Check: `curl -i https://YOUR-API/metrics` gives 401 (or 404 before the token is set); `curl -i -H "Authorization: Bearer $METRICS_TOKEN" https://YOUR-API/metrics` gives 200. Nothing in this repo scrapes `/metrics`; if you added an external scraper, give it the header.
7. **Branch protection.** GitHub > repo > Settings > Branches > Add branch ruleset (or classic rule) for `main`: require a pull request (0 approvals is fine when you work alone); require status checks `API Tests (Testcontainers)`, `Web Build (next build)`, `Type-check & Lint`, `API Docker Image`; require branches to be up to date. Do **not** make `Security Audit` required (a fresh advisory would block the PR that fixes it). The check names only appear in the picker after they have run once. Verify: open a PR with a failing check and confirm Merge is disabled. In Render, set auto-deploy to *After CI Checks Pass*.
8. **GitHub Settings > Advanced Security:** enable Dependabot alerts and Dependabot security updates (secret scanning + push protection came in P3.4). Optionally create a GitHub Environment `production` with yourself as required reviewer for the DB workflows.

## 4. Break-glass

- **Locked out of `/admin`:** unset `ADMIN_REQUIRE_2FA` (empty or delete) on Render **and** Vercel, redeploy both. Do not edit `two_factor_enabled` by hand.
- **`/chat` returns 413 for a real user:** raise `CHAT_BODY_LIMIT_BYTES` in `security/plugins.ts` (keep it under 4.5 MB while Vercel proxies the request).
- **A log line was flagged by `log-hygiene.test.ts`:** remove the value from the call. If it is reviewed and safe, add `// log-ok: <reason>` on the call line.
- **A dependency advisory blocks `Security Audit`:** merge the Dependabot PR; if no fix exists, add the advisory to `pnpm.auditConfig.ignoreCves` in the root `package.json` with a dated comment in the PR.

## 5. Destructive database tasks

`db-ops.yml` `reset` / `reset-and-migrate-all` and `db-migrate.yml` `reset-and-migrate` now stop when `public.users` has any row (no override). To wipe a populated database, take a backup, then run `DROP SCHEMA` by hand in the Supabase SQL editor. `seed.ts` refuses when the database has users other than the two seed accounts (`ALLOW_SEED_ON_NONEMPTY=1` overrides, local throwaway only). Seed models with `seed:models`, never `seed`, on production.

## 6. Known limits

- The log scanner is a tripwire, not proof: it cannot follow a sensitive value renamed on the way into a log call.
- The 4 MiB `/chat` body is parsed before authentication, so an unauthenticated caller can make the api read up to 4 MiB per request. Render's edge and the `/chat` rate limit bound the rate, not the size.
- Frozen web routes (`redeem`, `delete-account`, `export-data`, the admin REST routes) keep their own unbounded strings until the exception in section 2 is approved.
