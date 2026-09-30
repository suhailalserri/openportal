# Secret rotation (plan P3.4, closes G12)

Production: web = Vercel, api = Render, gateway (New API) = Render, Postgres = Supabase, Redis = Upstash.
**Dashboard click paths below are from memory and were not checked against the live UIs; the order of operations and the blast radius come from reading the code.**

## Ground rules

- Generate every random secret with `openssl rand -hex 32` (64 chars; `config.ts` needs 32+). Never paste a secret into chat, an issue, a PR or a log.
- A **Render** env change saves and redeploys the api. That redeploy uses the P3.2 drain (in-flight chats finish), so it is safe under load. Do it in a quiet window anyway.
- A **Vercel** env change only applies to a **new deployment**: redeploy web after changing it. `NEXT_PUBLIC_*` values are baked in at build time.
- Set Vercel values for **Production** and, if previews use them, **Preview**.
- Rotate on a schedule (suggested: 12 months) and immediately on any suspected leak (a secret in a log, a screenshot, a departed collaborator, a public repo push).
- After every rotation write one line in `docs/production/SESSION_LOG.md`: what, when, by whom (no values).

## Inventory

| Secret | Set on | Rotate how | Blast radius |
|---|---|---|---|
| `INTERNAL_SERVICE_TOKEN` | web **and** api (identical) | Overlap procedure below, zero downtime | Wrong order => web to api calls 401 (chat down) |
| `BETTER_AUTH_SECRET` | web (and api, same value) | See section; **avoid unless leaked** | All sessions die; 2FA may break (see section) |
| `CODE_SALT` | web **and** api (identical) | See section; **avoid unless leaked** | Every unredeemed code fails its checksum |
| `DATABASE_URL` (password) | web, api, GitHub secret | Supabase password reset, then update 3 places | Brief outage between reset and update |
| `REDIS_URL` (password) | web, api | Upstash reset, then update 2 places | Rate limits/queues degrade; chat idempotency and locks fail closed on money paths |
| `GATEWAY_MASTER_KEY`, `GATEWAY_ROOT_TOKEN` | api (and web, same config module) | Change in the gateway first, then here | Chat (master) or admin channel sync (root) fails until both sides match |
| Upstream provider keys | inside the gateway (New API channels), not in this repo | Add new channel key, drain, disable old (`provider-outage.md`) | Provider 401s |
| `RESEND_API_KEY` | web and api | Create new key, deploy, delete old | Emails fail until updated |
| `TELEGRAM_BOT_TOKEN` | api | BotFather `/revoke`, set new | Alerts silent until updated |
| `SENTRY_WEBHOOK_TOKEN` | api + the URL in Sentry's alert webhook | Change both | Sentry alerts stop reaching Telegram until both match |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | api / web | Sentry: new client key, swap, delete old | Events dropped until updated. A DSN is write-only, low risk |
| `SENTRY_AUTH_TOKEN` | Vercel (build time) | New token, update, delete old | Source-map upload skipped |
| `TURNSTILE_SECRET_KEY` | web | Cloudflare: roll secret, update | Register/redeem checks fail if a secret is set but wrong |
| `GOOGLE_CLIENT_SECRET` | web | Google Cloud console: add new secret, update, delete old | Google sign-in fails until updated |
| Supabase service-role key | **not used by this repo** | Verify unused (below) | n/a |

### Supabase service-role key
No code in this repo reads it (searched `apps`, `packages`, `.env.example`). Check Render and Vercel environment lists and GitHub secrets for a variable like `SUPABASE_SERVICE_ROLE_KEY`. If present and unused, delete it. If you ever add a use, add a row above first.

## INTERNAL_SERVICE_TOKEN: zero-401 rotation (rehearse this one)

The api accepts `INTERNAL_SERVICE_TOKEN` and, while `INTERNAL_SERVICE_TOKEN_PREVIOUS` is set to a 32+ char value, also that old token. Web only ever sends one token, so the api must move first.

Before: run 25 chat requests from the web app, all OK. Note the OLD token (Render env) and generate NEW.

1. **Render api > Environment:** add `INTERNAL_SERVICE_TOKEN_PREVIOUS` = OLD, set `INTERNAL_SERVICE_TOKEN` = NEW. Save and let it deploy.
2. **Check boot log:** Render logs show the warning `INTERNAL_SERVICE_TOKEN_PREVIOUS is set`. Web still sends OLD and it is accepted.
3. **Check the api accepts both** (does not need a user):
   - `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<api>/internal/sentry-test -H "Authorization: Bearer <NEW>"` and the same with `<OLD>`.
   - Expect the same non-401 status for both (200, or 409 if Sentry is off). A `curl` with a made-up token must give 401.
4. **Vercel web > Environment:** set `INTERNAL_SERVICE_TOKEN` = NEW (Production, and Preview if used). **Redeploy** web.
5. **Check web:** once the new deployment is live, send chat messages. Watch Render logs and Sentry for 401s for a few minutes.
6. **Remove the overlap:** delete `INTERNAL_SERVICE_TOKEN_PREVIOUS` on Render, deploy. Confirm the boot warning is gone and step 3 with `<OLD>` now returns 401 while `<NEW>` is accepted. Run 25 chat requests again.
7. Log it in SESSION_LOG. Tick the LAUNCH_CHECKLIST line after the first successful rehearsal.

**Rollback:** before step 6, put OLD back on Vercel and redeploy; the api still accepts it. After step 6, re-add `INTERNAL_SERVICE_TOKEN_PREVIOUS` = OLD on Render (or set both services to one known token).
**Do not leave `_PREVIOUS` set.** It keeps a retired (possibly leaked) token valid.
If the token itself leaked: do steps 1 to 6 back to back, then step 3 must show OLD as 401.

## BETTER_AUTH_SECRET

Avoid rotating unless it leaked. Expect:
- Every session becomes invalid: all users are signed out. Announce first.
- **2FA and possibly more.** better-auth's two-factor plugin protects the stored TOTP secrets using the auth secret, as I understand it (not verified in this repo or against the installed version). Rotating may make every enrolled user's authenticator codes stop working, admins included. Before rotating, confirm with a test account that 2FA still works on a **copy** or accept the risk, and make sure you have a database-level way to reset 2FA for your admin account.
- Whether the installed better-auth supports a previous-secret list is unverified. Check its docs for your exact version. If it does, prefer that (add new, keep old, remove after sessions age out, 7 days).

If rotating anyway: set the same new value on Vercel and Render, redeploy both, then verify login, logout, a fresh 2FA login and a passkey login on a test account. `BETTER_AUTH_URL` is not a secret and does not change.

## CODE_SALT

The redeem checksum is an HMAC keyed with `CODE_SALT`, computed in `apps/web/lib/generate-code.ts` and `apps/api/src/services/redeem.service.ts`. Both must hold the same value. Changing it makes **every already-issued, unredeemed code fail the format check** ("invalid code"), so paying customers holding gift cards or prepaid codes cannot redeem.

Only rotate if the salt leaked (it lets someone forge valid-looking codes; each forged code still needs to exist in the database, so the real exposure is brute-force efficiency, not free credit). Steps:

1. Admin > code inventory: note the number of unredeemed codes and their batches.
2. If there are unredeemed codes in customers' hands, do not rotate yet. Decide: reissue them under the new salt, or accept invalidating them and refund/replace manually.
3. Change `CODE_SALT` on Vercel and Render at the same time, redeploy both.
4. Generate replacement batches (they now carry the new checksum), then revoke the old batches with the admin code-batch tools so they cannot be redeemed if the salt-less path is ever bypassed.
5. Test: redeem a fresh code end to end.

## DATABASE_URL (Supabase password)

1. Announce a 2-minute maintenance window; pick a quiet hour.
2. Supabase > Project Settings > Database > reset the database password. **From this moment every connection with the old password fails.**
3. Immediately update `DATABASE_URL` on Render (api), Vercel (web) and the GitHub Actions secret `DATABASE_URL` (used by `db-migrate.yml` / `db-ops.yml`). Keep the pooler host/port; only the password changes. URL-encode special characters.
4. Redeploy api and web. Check `/ready` is 200 and a chat completes.
5. Confirm the nightly backup workflow/secret still connects on its next run (`docs/runbooks` restore drill from P0.1/G11 if present).

A zero-downtime alternative (a second database role with its own password) is possible but needs grants and was not verified here.

## REDIS_URL (Upstash)

Upstash > database > reset password (or create a new database and migrate: not needed, queues are re-registered at boot). Update `REDIS_URL` on Render and Vercel, redeploy both. During the gap: the rate limiter degrades to per-process limits (metric `aip_rate_limit_fallback_total` rises), BullMQ jobs pause, and the billing lock/idempotency paths fail closed on money paths (chat returns retryable errors). Check `/ready` is 200 afterwards and `aip_rate_limit_fallback_total` stops increasing.

## Gateway keys

`GATEWAY_MASTER_KEY` (chat, `/v1/*`) and `GATEWAY_ROOT_TOKEN` (admin, `/api/*`) are two different credentials. Create the new value in the gateway (New API admin) first, keep the old one valid, then update the api (and web if it has them set), then revoke the old one. Verify with one chat and one admin channel sync.

## Other services (one line each)

- **Resend:** create a new API key, update Vercel + Render, deploy, send a test verification email, delete the old key.
- **Telegram:** `/revoke` in BotFather gives a new token; update `TELEGRAM_BOT_TOKEN`, deploy, trigger a test alert. The chat id is not a secret.
- **Sentry webhook token:** pick a new 24+ char token, update `SENTRY_WEBHOOK_TOKEN` on Render and the token in the Sentry alert-rule webhook URL, in that order, then trigger a test alert.
- **Turnstile / Google:** roll the secret in Cloudflare / Google Cloud, update Vercel, redeploy web, test a registration / Google sign-in.

## GitHub secret scanning and push protection (owner, one time)

GitHub > repo > Settings > Advanced Security (or "Code security"): enable **Secret scanning** and **Push protection**. This is a repository setting; nothing in the repo can turn it on. If a push is ever blocked, rotate that secret as if it leaked, do not bypass. If a real secret was ever committed, rotating is mandatory even after deleting the commit.
