# P1.1 — Account guard + admin protections

Plan: `docs/MASTER_PLAN.md` §6 P1.1 (closes G2, G2b). No frozen file was edited.

## What changed

- `apps/api/src/utils/account-guard.ts` (new, pure): `assertUsableAccount(user)`
  returns `{ok:true}` or `{ok:false, reason:"suspended"|"fraud_flagged"}`. Any
  `status !== "active"` counts as suspended, matching what the REST paths
  already did.
- `auth.middleware.ts`: all three paths (internal token, **session cookie**,
  API key) go through one helper. The cookie path had no check before.
- `routers/trpc.ts`: `protectedProcedure` and `adminProcedure` throw `FORBIDDEN`
  with message `ACCOUNT_SUSPENDED` / `ACCOUNT_UNDER_REVIEW`. Because
  `apps/web/server/context.ts` feeds the same `appRouter`, this covers the
  Next.js tRPC handler and caller too.
- `admin.updateUserStatus`: one transaction. Rejects self (`CANNOT_MODIFY_SELF`),
  unknown user (`NOT_FOUND`), and a non-superadmin targeting an admin or
  superadmin (`INSUFFICIENT_ROLE_FOR_TARGET`). Suspending deletes the user's
  `sessions` rows. Audit row now records `before.status` and `sessionsRevoked`.
- `fraud.service.ts`: a critical event flags the user **and** revokes sessions.
- Migration `0018_revoke_sessions_on_lockout.sql`: trigger that deletes a user's
  sessions on the transition into `suspended` or `is_fraud_flagged = true`.
  Backstop for writers outside `apps/api`. Added to `deploy.yml` and
  `db-ops.yml` lists; `db:migrate:manual` discovers it by filename.

## External contract

- REST bodies unchanged (`Account suspended`, `Account under review`).
- **New tRPC error messages** (additive; previously these calls succeeded):
  `ACCOUNT_SUSPENDED`, `ACCOUNT_UNDER_REVIEW`, `CANNOT_MODIFY_SELF`,
  `USER_NOT_FOUND`, `INSUFFICIENT_ROLE_FOR_TARGET`. `docs/frontend/API_CONTRACT.md`
  should list them; the frontend does not map them yet (follow-up).

## Follow-up: frozen-zone edits (owner-approved 2026-09-29)

The owner approved closing the frozen-route gaps now. These files under
`apps/web` were edited on purpose; every edit is listed here.

- `apps/web/lib/account-guard-server.ts` (**new**): `rejectUnusableAccount(userId)`
  reads the user row and applies the shared `assertUsableAccount`. Returns
  `null` or a 403 `{ error, code }`; a missing user is 401; a DB error
  propagates (fail closed).
- 19 route files, 24 handlers under `apps/web/app/api/**`: each got the same
  import plus two lines right after its existing session check
  (`const lockedAccount = await rejectUnusableAccount(session.user.id); if (lockedAccount) return lockedAccount;`).
  Nothing else in those files changed except the PATCH route below.
  Files: admin/{codes,fraud,fraud/[id]/resolve,logs,stats,users,users/[id],users/[id]/credits},
  balance, chat, conversations, conversations/[id], redeem, transactions,
  usage/export, user/{delete-account,export-data,sessions,sessions/[id]}.
- `apps/web/app/api/admin/users/[id]/route.ts` PATCH: no longer writes
  `users.status` itself. It calls `applyUserStatusChange`
  (`apps/api/src/services/user-status.service.ts`), the same code the tRPC
  mutation now uses: no self-suspend, superadmin protection, 404, session
  revocation, audit row. Bad JSON or a non-UUID id is now 400 (was a 500 or
  an unhandled throw).
- `apps/web/lib/auth.ts`: `session.cookieCache` **disabled** (was 5 min).
  Trade-off: one session lookup per `getSession` call. If P4.2 shows it hurts,
  restore a short `maxAge` (about 30 s), not 5 min.
- `apps/api/package.json`: two new `exports` entries
  (`./utils/account-guard`, `./services/user-status`).

Behaviour changes to be aware of:

- A suspended or fraud-flagged user now gets 403 on every one of those routes,
  including `user/export-data` and `user/delete-account`. They must go through
  support for those. Say so if you want those two exempted.
- The 403 body is `{ error: "Account suspended" | "Account under review", code }`.
  `code` is new and additive.
- `audit_logs.ip` is now stored as NULL when the caller's IP is not a single
  valid address (previously a value like `unknown` made the insert throw).
- P1.3 will replace the raw `x-forwarded-for` read in the PATCH route with the
  shared `getClientIp()`.

Still open after this:

- A suspended user can still log in and get a session row. Every surface now
  refuses it, but blocking creation (`databaseHooks.session.create.before`) was
  not done: it needs a better-auth hook signature I cannot verify here, and a
  blocked login gives the user a generic error instead of the "suspended" copy.
- The frontend does not map `ACCOUNT_SUSPENDED` / `ACCOUNT_UNDER_REVIEW` yet.
- `docs/frontend/API_CONTRACT.md` should list the new codes.

---

# Backend PR — Delete-account 2FA gate

Split out of Phase 7.2 (Settings: preferences, API access, referral,
privacy) because it touches `apps/web/app/api/**`, which
`docs/FRONTEND_REBUILD_PLAN.md`'s frozen zone (§4) reserves for
backend-track (§7) sessions only. This PR targets `main` directly, on
its own branch, independent of `frontend-v2`.

## What changed

`apps/web/app/api/user/delete-account/route.ts`: if the account has
2FA enabled (`users.twoFactorEnabled`), deletion now also requires a
valid TOTP or backup code in the request body's `twoFactorCode`,
checked via better-auth's own `auth.api.verifyTOTP` /
`auth.api.verifyBackupCode` — the same server-side primitives
`two-factor-section.tsx` already drives client-side through
`authClient.twoFactor.*`. A non-2FA account's flow is byte-identical
to before.

New error responses (400): `TWO_FACTOR_REQUIRED` (code omitted),
`INVALID_TWO_FACTOR_CODE` (code present but wrong). Existing responses
(`PASSWORD_REQUIRED`, `INCORRECT_PASSWORD`, `CONFIRMATION_REQUIRED`,
`TOO_MANY_ATTEMPTS`) are unchanged.

This closes the gap in the plan's own §6 Phase 7.2 text: "delete
account (password confirm; 2FA code if enabled)."

## Compatibility with the frontend

The Phase 7.2 frontend PR (`features/settings/sections/data-privacy/
delete-account-dialog.tsx`) already handles both new error codes and
was written/shipped independent of this PR's merge order:
- Deployed against today's (unpatched) route: a 2FA-enabled account
  deletes on password alone — no error, no crash, same as every
  account before Phase 7.2.
- Once this PR merges: the already-shipped frontend picks up the 2FA
  step automatically, no frontend redeploy needed.

Merge either order; no coordination required beyond this note.

## Not verified

Better-auth's exact `verifyTOTP` / `verifyBackupCode` server-side
export names and error shape on the installed version — this sandbox
has no network/`node_modules` to import better-auth and confirm
against the real package. The client-side calls this mirrors
(`authClient.twoFactor.verifyTotp` / `verifyBackupCode`) are real and
already in use elsewhere in this codebase, but the *server-side*
`auth.api.*` names are inferred from better-auth's usual client/server
naming symmetry, not confirmed against source. If either name is
wrong, it's a one-line fix in the route (it fails loudly — a wrong
method name throws at call time, not silently) and the two `catch`
blocks already narrow on `APIError` only, so anything else (e.g. a
`TypeError` from calling a nonexistent method) will surface immediately
in CI/preview rather than being swallowed as "invalid code."

## How to verify

- `apps/api`'s Testcontainers suite doesn't cover this route (it's a
  Next.js route handler in `apps/web`, not a tRPC procedure) — add a
  route-level integration test if this codebase has a harness for
  `apps/web` API routes; otherwise this needs a live preview pass:
  - Non-2FA throwaway account: delete-account completes on password
    alone (regression check — must still work exactly as before).
  - 2FA-enabled throwaway account: submitting only a password returns
    `TWO_FACTOR_REQUIRED`; a wrong TOTP/backup code returns
    `INVALID_TWO_FACTOR_CODE`; a correct one completes the deletion and
    signs the session out.
  - Confirm the deleted 2FA account's `twoFactor` row is actually gone
    (existing anonymization transaction already deletes it — verify
    that still runs after the new check, not bypassed by an early
    return).
