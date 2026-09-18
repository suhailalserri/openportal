# Branch, CI & Preview — Session 0.2 Notes

## Branch
`frontend-v2`, created from `main`. `main` keeps the legacy UI untouched
except backend PRs (§7, additive only) — per plan rules L3 and 0.2.

## Deploy targets (confirmed, not in the plan's default assumptions)
- **apps/web → Vercel.** Production deploy = `main`. Preview deploys =
  every other branch/PR, including `frontend-v2` and PRs into it. This
  matches the `VERCEL_URL`-based `trustedOrigins` logic already present
  in `apps/web/lib/auth.ts` (F18) — that code was write-ahead evidence
  Vercel was the real target even before this was confirmed directly.
- **apps/api → Render.** Deploys on push to `main` via Render's own
  GitHub webhook integration (see the comment already in
  `.github/workflows/deploy.yml`). Render is not currently building a
  parallel preview for `frontend-v2` — the frontend-v2 Vercel preview
  talks to whatever `apps/api` / DB `frontend-v2`'s env vars point at
  (see D1 below). If `apps/api` itself needs a change to unblock a later
  frontend phase, that PR targets `main` directly per plan rule L3 — it
  is not part of the `frontend-v2` branch.

## D1 — Preview environment data — DECIDED
`frontend-v2` previews use the **production database** (same Vercel
Preview env as prod, incl. GATEWAY_*, CODE_SALT). Rules that follow:
- Sign in on previews with dedicated test accounts only.
- Previews spend real provider credits (shared GATEWAY_MASTER_KEY) and
  real users CAN sign in on a preview URL — treat it as production data.
- Do not run admin money actions (approve payments, adjust credits,
  revoke codes) on real users' records from a preview.
- Revisit before 5.1 (redeem/billing) and 8b (admin money ops); a
  staging DB is the safer setup for those.

## 0.2 closed
All 5 CI jobs green on `frontend-v2` (run #111). Vercel preview builds
and sign-in works on it (F18 confirmed). Tracker 0.1 + 0.2 ticked.
Carry into 0.3: pin `runs-on: ubuntu-24.04` (ubuntu-latest moves to 26 on
2026-10-19); confirm `creditBalance > throws if the user has no balance
row` passes for the right reason.

## CI jobs added in `.github/workflows/deploy.yml`
| Job | Status this session | Notes |
|---|---|---|
| `check` | Real, unchanged | Renamed from `test` → `check`; same steps as before |
| `api-tests` | Real | `pnpm --filter @ai-platform/api test` — uses Testcontainers (own Postgres per test file), no external DB needed in CI |
| `web-build` | Real | `next build` with dummy env vars (listed in the workflow file) |
| `web-unit` | No-op until 1.2 | Skips gracefully if no vitest config exists in `apps/web` yet |
| `i18n-parity` | No-op until 1.2 | Skips gracefully if `scripts/check-i18n.ts` doesn't exist yet |

`web-build`'s dummy env var list was built from `turbo.json`'s
`globalEnv` array plus `packages/db/src/index.ts`'s hard `DATABASE_URL`
check (throws at import if unset — this is the exact failure mode the
plan's F-note about `web-build` warns about). If `next build` fails on a
var not in that list, add it to the `web-build` job's `env:` block — do
not add a real secret to this workflow file; CI values are all
intentionally fake/unreachable.

## Vercel confirmation still needed
This session could not verify (no network access in the build sandbox):
- That the Vercel project is actually connected to this GitHub repo and
  set to build `frontend-v2` and its PRs.
- That signing in on a `frontend-v2` preview URL actually works (F18's
  claim, plausible from the code but unconfirmed end-to-end).

**Action for you:** open a PR into `frontend-v2` (even an empty one) and
confirm (a) a Vercel preview URL is generated, (b) you can sign in on
it. That satisfies plan rule 0.2's "confirm Vercel builds previews" step
and closes the F18 unverified tag.

## api-tests — first CI run result and fix (0.2 continuation)
First run: `gateway.service.test.ts` — 4 of 5 tests timed out at 60s each;
the job then hung ~10 min until cancelled. Root cause was in the TEST
mocks, not production code:
1. `chainableNoop` (Proxy) returned itself for `.then`, making it a
   thenable that never resolves. `streamChat` awaits
   `db.insert(conversations)...onConflictDoNothing()` (gateway.service.ts),
   so every test past the model lookup hung. Test 1 passed only because it
   returns before that line. Fix: `get` returns `undefined` for `"then"`.
2. The interrupted-stream test called `enqueue()` and `error()` in the same
   `pull()`; `error()` resets the queue, discarding the chunk, so the
   "bills partial content" assertion could never pass. Fix: enqueue on the
   first pull, error on the second.
Both reproduced in plain Node before fixing. Only the test file changed;
`gateway.service.ts` is untouched. Land on `main` (plan L3) and merge into
`frontend-v2`. The other 5 API test files had not reported results when
the run was cancelled — still unverified.

## api-tests — second finding: DB-backed test files hang (0.2 continuation)
After the gateway fix, `gateway.service.test.ts` passes (5 tests, 41 ms),
but the job ran 10+ min with no other file reporting. The 5 DB-backed
files all call `startTestDb()`, which runs `npx drizzle-kit push` via
`execSync`. `packages/db/drizzle.config.ts` has `strict: true`, which makes
push wait for an interactive confirmation on EVERY run (the old comment in
testDb.ts said otherwise — wrong). stdin is "ignore", push holds its DB
connection open, so the child never exits; `execSync` blocks the event
loop so vitest's 60s hookTimeout can't fire. Result: silent infinite hang.
Fix: `packages/db/drizzle.test.config.ts` (same as the real config with
`strict`/`verbose` off), used only by testDb.ts, plus `timeout: 120_000`
and captured stdout/stderr on `execSync` so any future hang fails in 2 min
WITH the reason. **This diagnosis is inferred from the code and drizzle's
documented `strict` behaviour, not observed in a log** — I could not run
drizzle-kit here. If the job still fails/hangs, the new error output will
say why; paste it.

**Update — hang fixed, confirmed by the next CI run:** the DB test files
now start (schema push works; TRUNCATE notices in the log) and the suite
finishes in ~2m20s instead of hanging.

## api-tests — third finding: TLS to a non-TLS test database
That run: 43 of 52 tests failed, all with "Client network socket
disconnected before secure TLS connection was established".
`packages/db/src/index.ts` sets `ssl: "require"` unless
`DATABASE_SSL=disable`; the Testcontainers Postgres has no TLS. Fix: set
`DATABASE_SSL: "disable"` in `apps/api/vitest.config.ts` `test.env` and in
`startTestDb()`. No production code touched. Watch for: the 9 tests that
passed include `creditBalance > throws if the user has no balance row`,
which would also "pass" on ANY error — once the TLS fix lands, confirm it
still passes for the right reason (a "balance row" message).

## Vercel preview build — missing env (not a code problem)
`next build` on the `frontend-v2` preview compiled, linted (3 warnings, no
errors) and type-checked, then failed at "Collecting page data" with
REDIS_URL, GATEWAY_URL, GATEWAY_MASTER_KEY, GATEWAY_ROOT_TOKEN, CODE_SALT
"Required". Those five are missing from the **Preview** environment scope
in Vercel (Settings → Environment Variables; each var has separate
Production / Preview / Development checkboxes). Env changes only apply to
NEW deployments — redeploy after fixing. Use the same CODE_SALT as the DB
you point the preview at, or redeem-code checksums won't validate.

## web-build — first CI run result and fix (0.2 continuation)
Red on first run. The job log was not available, so these two causes are
inferred from the files (not observed in a log):
- Job-level `NODE_ENV: production` makes pnpm skip devDependencies
  (typescript, tailwindcss, @tailwindcss/postcss, eslint-config-next…).
  Removed; `next build` sets NODE_ENV itself.
- Dummy `INTERNAL_SERVICE_TOKEN` was 14 chars; `apps/api/src/config.ts`
  requires `min(32)` and throws at import while Next collects page data.
If it is still red, paste the failing lines from the Web Build job.

Also added: `timeout-minutes` on every job and a `concurrency` group with
cancel-in-progress.

## ESLint config
Added `apps/web/.eslintrc.json` (legacy format — `apps/web`'s ESLint is
`^8.0.0`, which is what `next lint` expects; ESLint 9's flat config is
not the default resolution path for that version). Contains the Rule 2
ban via a `no-restricted-syntax` regex on JSX `className` string
literals. Verified the regex against a manual test list of ~25 realistic
Tailwind classes (see delivery message) — correctly flags
`ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/border-l/border-r/
rounded-l/rounded-r` while not false-positiving on `ps-/pe-/ms-/me-/
start-/end-/mt-/mb-/text-sm/text-primary/` etc. **Not yet run through
real ESLint** (no network to install/run it here) — first CI run on
`frontend-v2` is the actual verification. A matching unit test proving
`ml-2` fails lint is listed in the plan as a 1.2 deliverable, not 0.2 —
not included here.

Note: this regex only catches string-literal `className="..."` usage.
It will **not** catch dynamically constructed classes (template
literals, `clsx()`/`cn()` calls with computed strings, className built
via array `.join()`). That's a known gap common to this style of rule;
flagging it now rather than after someone finds it the hard way. If that
turns out to be a real gap once real components exist, a stricter
approach (e.g. `eslint-plugin-tailwindcss`'s class-order awareness, or a
custom rule walking `cn()`/`clsx()` call arguments) can replace this in
a later session — out of scope for 0.2.
