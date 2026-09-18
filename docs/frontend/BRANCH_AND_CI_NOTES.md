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

## D1 — Preview environment data (still open)
The plan's default: "Staging Supabase project; else prod DB with
dedicated test accounts." **Not decided in this session** — I don't have
access to your Vercel project's environment variable configuration, so I
can't confirm which `DATABASE_URL` the `frontend-v2` preview will
actually use at runtime. That's a Vercel dashboard setting (Project →
Settings → Environment Variables, scoped to Preview), not a file in this
repo.

Action needed from you: in Vercel, set the `frontend-v2` preview
environment's `DATABASE_URL` (and the other vars listed in
`web-build`'s CI job below) to either a staging DB or your production DB
with credentials for dedicated test accounts only. Until that's set,
Vercel previews will build (assuming Vercel's own build also has *some*
value for `DATABASE_URL`, even a placeholder — same constraint as CI)
but any page that actually queries the DB at request time will fail at
runtime, not build time.

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

## api-tests risk (unresolved, needs your CI run to know)
The plan says: "If `api-tests` is red, fix or explicitly skip-list now."
This session could not run the suite (no network/Docker access here to
actually execute Testcontainers). The 6 existing test files
(`balance`, `redeem`, `fraud`, `gateway`, `referral`,
`manual-payment` `.service.test.ts`) look self-contained and shouldn't
need anything beyond what CI already provides (Docker on
`ubuntu-latest`), but this is unverified. **If this job goes red on your
first CI run, paste the failing log lines in the next message** per the
plan's "one blocker at a time" rule — don't let me guess at a fix here.

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
