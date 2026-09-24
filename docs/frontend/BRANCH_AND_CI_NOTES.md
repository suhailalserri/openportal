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

---

## Session 0.3 — Contract freeze + cleanup

### `runs-on: ubuntu-24.04`
Pinned on all 5 jobs in `.github/workflows/deploy.yml` (`check`,
`api-tests`, `web-build`, `web-unit`, `i18n-parity`). Carried over from
the 0.2 note above — `ubuntu-latest` moves to Ubuntu 26 on 2026-10-19,
mid-rebuild; pinning removes that variable entirely for the rest of the
`frontend-v2` work.

### `creditBalance > throws if the user has no balance row`
Confirmed the message this actually throws (`balance.service.ts:123`:
`` `Balance row not found for user ${userId}` ``) and tightened the
assertion from a bare `.rejects.toThrow()` to
`.rejects.toThrow("Balance row not found")`. The bare form is exactly
what let this test read as "passing" during the TLS-failure period noted
in the 0.2 section above — it would have passed on that unrelated
connection error just as easily as on the real one. No production code
touched.

### `docs/frontend/API_CONTRACT.md` — new
Full tRPC + REST + chat-stream + Better-Auth-client contract, verified
directly against `apps/api/src/routers/*.ts` and every route file under
`apps/web/app/api/**`. Supersedes the plan's Appendix C (a name list) as
the thing later phases should build against. Additions found beyond
Appendix C's list, all confirmed in code:
- `DELETE /api/user/sessions` (collection route — "log out other
  devices" — not just the `[id]` single-session route).
- `GET|POST /api/auth/[...all]` and `GET|POST /api/trpc/[trpc]` as
  explicit routes (previously implied, not listed).
- `revokeSessions` (plural) in the Better Auth client export list.
- One correctness discrepancy in the legacy REST surface:
  `/api/admin/users/[id]/credits` does a raw
  `sql\`credits + ${delta}\`` update with no floor check, unlike the
  tRPC `admin.adjustCredits`, which uses `deductCreditsAtomic` and
  returns a clean `BAD_REQUEST` instead of relying on the DB's
  `credits >= 0` CHECK constraint to fail loudly. Flagged in the
  contract doc's legacy-REST table for the 9.3 cleanup pass — not fixed
  here, since `apps/api`/`apps/web/app/api` is the frozen zone and this
  route works today, just less safely than its tRPC twin.
- 46/46 tRPC procedure names checked 1:1 against the four router files;
  none renamed or missing on either side.

### `apps/web/public/.gitkeep`
F15 lists `public/` as a junk/empty dir candidate, but
`apps/web/Dockerfile:26` does `COPY --from=builder .../apps/web/public
./apps/web/public` — deleting it would break that build step. Added
`.gitkeep` instead so the directory survives in git while staying empty
of real content. Not deleted.

### F15 empty/junk directories — nothing to commit
`auth/{login,register,verify,forgot,reset}`, `admin/codes/generate`,
`billing/success`, `api/user/api-key`, `api/webhooks/status` are all
genuinely empty directories in the reviewed zip (confirmed via `find
-type d -empty`), and this zip has no `.git` — nothing was ever tracked
here, so there is no commit-level delete to make. The "DELETE list" for
this phase is informational only, for your own local copy or older zips
that might have placeholder files inside these paths.

### Discrepancy noticed, out of scope for 0.3
F15 also states `tailwind.config.ts` "is v3-style and not loaded (no
`@config` in `globals.css`, Tailwind v4)". The reviewed zip's
`app/globals.css` line 4 **does** contain
`@config "../tailwind.config.ts";` — so it is in fact being loaded by
Tailwind v4's compatibility import, contradicting that line of the
audit. This doesn't affect 0.3 (the plan defers actually deleting
`tailwind.config.ts` to 1.2, not 0.3), so nothing here was changed — but
1.2 should re-check F15's framing before assuming the old config is
inert, since it may currently be doing something (or silently
conflicting with whatever 1.1 designs).

### Not verified (no network/build in this sandbox)
- That CI is actually green on `frontend-v2` after these changes — needs
  a real push + Action run.
- That the `legacy-ui` tag (confirmed created on your end) points at the
  commit you intend as the pre-rebuild rollback point.



---

## Session 1.2 — Foundation code + kitchen-sink

### CI table update (edit the two rows in the 0.2 table)
| `web-unit` | Real (since 1.2) | vitest: `lib/format.test.ts` (formatCredits at 0, 1, 999_999, 1_000_000, 2_670_000_000) + `eslint-rules.test.ts` |
| `i18n-parity` | Real (since 1.2) | `scripts/check-i18n.ts` — ar/en key parity + missing/unused keys |

### 1.2 closed
All 5 CI jobs green on `frontend-v2` (run #[___]). `/en/dev/kitchen-sink`
loads on the Vercel preview. Tracker 1.2 ticked.

### What landed (apps/web)
- 20 shadcn primitives: the plan's 19 plus `label`, which `form.tsx` needs.
- `providers/`: next-themes, Radix `DirectionProvider`, tRPC+Query, Sonner with `dir`.
- `lib/format.ts`, `styles/index.css`, rewritten `layout.tsx` + placeholder `page.tsx`, `vitest.config.ts`, `scripts/check-i18n.ts`, `/dev/kitchen-sink`.
- Legacy deleted (52 paths): `components/**`, `hooks/*`, old pages, `globals.css`, `tailwind.config.ts`.

### Deviations / decisions
- Extra deps beyond the plan: `@radix-ui/react-slot`, `@radix-ui/react-label`
  (declared explicitly because pnpm strict linking ignores transitive copies),
  `tw-animate-css` (dev; `animate-in`/`zoom-in-95` aren't in Tailwind v4 core).
- `formatCredits`/`formatDate` now live only in `lib/format.ts` with
  `numberingSystem: "latn"`. The old copies in `utils.ts` lacked it and would
  have rendered Eastern Arabic-Indic digits in `ar-SA` (D6 violation). Removed.
- Sheet slides from the correct physical edge in both directions via `useDirection()`.
- Not ported from the old `globals.css` (deliberate, later phases): scrollbar
  styling, noise texture, header glow, hljs theme.

### Known gaps carried forward
- ESLint Rule 2: a bare `left-1/2` passes (the exception doesn't require
  `-translate-x-1/2`). `eslint-rules.test.ts` documents this. The 0.2 gap also
  stands: `cn()`/`clsx()`/template-literal classes aren't caught.
- Frozen `middleware.ts` redirects `/` → `/{locale}/chat`. Chat is deleted, so
  bare `/` 404s until a chat route exists. Placeholder page is reachable at
  `/ar` and `/en` only. [Confirm on preview.]
- `tailwind.config.ts`: 0.3 asked 1.2 to re-check whether `@config` in
  `globals.css` was loading it. [Fill in what you found; the delivery message didn't say.]

### Not verified / confirm manually
[Tick what you checked; leave the rest listed]
- `/ar/dev/kitchen-sink`, light + dark
- Tabs/DropdownMenu arrow-key nav mirrored in Arabic
- Sheet direction in ar and en
- Bare `/` behaviour (see above)

### Reminder
D1: previews use the production DB. Revisit before 5.1 and 8b.

---

## Session 2.1 — App shell + guards

### Input zip was not the post-1.2 tree
The attached zip had 1.2's ADDITIONS (providers, `components/ui`, `lib/format.ts`,
vitest config, kitchen-sink) but none of 1.2's 52 DELETES: the legacy
`components/**` (except `ui/`), `hooks/*`, `app/[locale]/{admin,auth,billing,chat,settings}/**`,
`app/globals.css` and `tailwind.config.ts` were all still present (exactly the 52 paths
in the 1.2 note). That tree cannot type-check (legacy files import `formatCredits` from
`@/lib/utils`, which 1.2 removed). I built against the zip minus those 52 paths. If your
repo still contains any of them, `app/[locale]/chat/page.tsx` collides with the new
`(app)/chat/page.tsx` and the build fails — delete them first.

### Decision A implemented (`middleware.ts`, frozen zone, explicit OK)
One added `response.headers.set("x-pathname", pathname + search)` line (+ comment),
placed right after the existing `x-next-intl-locale` line. **Deliberately a response
header, not `NextResponse.next({ request: { headers } })`**: the locale header already
reaches server components this way in production, so `x-pathname` rides the proven
mechanism, and the locale line is untouched. The request-headers form would have added an
`x-middleware-override-headers` code path whose interaction with the locale header I could
not test. `middleware.test.ts` asserts both headers and the unchanged bare-`/` redirect.
The value is untrusted everywhere: it only reaches a redirect via `sanitizeNext`.

### What landed (apps/web)
- `lib/`: `request-path.ts`, `roles.ts`, `safe-redirect.ts`, `guards.ts`, `session.ts`
  (React-`cache`d `getServerSession`, `getRequestPath`) + tests.
- `config/nav.ts` (+ test): role-filtered groups; unbuilt entries `enabled: false`
  (render as disabled "Soon" rows). Test fails if an enabled entry has no page file.
- `components/layout/`: `app-shell`, `app-sidebar`, `nav-group`, `nav-link-item`,
  `nav-icon`, `mobile-drawer`, `main`, `section-page`, `use-is-mobile`.
- Routes: `(public)/page.tsx`, `(auth)/auth/layout.tsx` (inert), `(app)/layout.tsx`,
  `(app)/chat/page.tsx` (placeholder), `(admin)/layout.tsx`, `(admin)/admin/page.tsx` (placeholder).
- Messages: `nav.*` +13 keys, new `shell.*` (8 keys), ar/en parity kept.
- Deleted: `app/[locale]/page.tsx` (moved to `(public)`).

### Deviations from the approved summary
- Added `components/layout/app-shell.tsx` and `nav-icon.tsx` (not in the summary's file
  list): the drawer state needs a client owner, and icons live outside `config/nav.ts`
  so vitest can load it without React.
- Also added `lib/roles.ts` (single admin-role list for guards + nav) and
  `middleware.test.ts`.
- The middleware change is 1 statement + comment, not "one line".
- Guards use relative imports: `vitest.config.ts` has no `@/` alias.

### Verified here (sandbox, no network)
- The 108 cases in `safe-redirect`, `guards` and `nav` tests pass under a hand-written
  vitest stand-in (real vitest not installed here). Strict `tsc`
  (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) is clean on
  `lib/{roles,safe-redirect,guards}.ts` and `config/nav.ts`.
- Rule 2 regex from `.eslintrc.json` run over every class-like string literal in the new
  files: 0 hits.

### Not verified (needs CI / preview)
- `next build` with the new route groups; type-check of every `.tsx` and of the test
  files against real vitest types.
- `middleware.test.ts` (needs real `next/server`), and that `headers()` in a layout
  actually sees `x-pathname` (inferred from the locale header working).
- `session.user.role` populated at runtime (cookie cache means up to 5 min stale).
- Drawer behaviour and start-edge slide on a real phone, ar + en.
- Contrast of `text-sidebar-foreground/70` headings and disabled rows (1.1 checked
  body/muted text, not sidebar).

### Known gaps / carried forward
- `/{locale}/auth/login` 404s until 3.1, so "returns after login" moves to 3.1's checklist
  (`resolvePostLoginTarget` is ready and tested).
- Layouts don't re-run on client navigation; an expired session is caught by API 401s
  (2.2's `error.tsx`).
- Moving between `(app)` and `(admin)` remounts the shell (separate layouts).
- `sheet.tsx`'s built-in close button has a hard-coded English `sr-only` label; the drawer
  uses its own translated close button. Worth fixing in the primitive later.
- `/dev/kitchen-sink` is still publicly reachable on production/preview (default-open
  gate, see its comment); with real content now behind the app, gate or delete it before 9.3.
- 1.2's unresolved placeholders in this file (`run #[___]`, tailwind `@config` finding,
  "confirm on preview" items) are still yours to fill in.

### 2.1 closed (signed-out scope)
CI green on `frontend-v2` after the `nav-link-item.tsx` type fix (run #[___]).
Verified on the preview: signed-out `/ar/chat` redirects to
`/ar/auth/login?next=%2Far%2Fchat`, so the `x-pathname` header, the (app) guard and
`buildLoginRedirect` work end to end. `/api/auth/get-session` returns `null` on the preview
host: session cookies are per host, and no login page exists until 3.1, so the signed-in
checks could not run. Moved to 3.1's "Done when" (see the plan).
Tracker 2.1 ticked.

### Carry into 3.1
- Signed-in checks from 2.1 (listed in the plan's 3.1 "Done when").
- Confirm what deployed `lib/auth.ts` does when `RESEND_API_KEY` is unset
  (`requireEmailVerification` is unconditional).
- Have a seeded admin and a seeded non-admin test account ready. D1: previews use the
  production DB, so use dedicated test accounts only.
- Gate or delete `/dev/kitchen-sink` before 9.3.
- `sheet.tsx` has a hard-coded English `sr-only` close label.

### 2.1 CI fix — first push
`Type-check & Lint` and `Web Build` failed with the same error (Lint never ran, it was
skipped after Type check failed): `components/layout/nav-link-item.tsx:47` —
`onClick={onNavigate}` passes `(() => void) | undefined` to `<Link>`, and
`exactOptionalPropertyTypes: true` (tsconfig.base.json) forbids explicit `undefined` on an
optional prop. Fix: `onClick={() => onNavigate?.()}` and a conditional spread for
`aria-current`. My sandbox `tsc` only covered the pure `.ts` modules (no React/Next types
installed), which is why this was missed. Everything else was green on that run:
API tests, Web Unit Tests (incl. `middleware.test.ts` on real `next/server`) and i18n parity.
Lint still unverified until the next run.

---

## Session "restyle" (between 2.1 and 2.2) — component restyle + design-source swap

Not a numbered plan session — a detour off Phase 2.2 to restyle `components/ui/*`
against a new design export and pull the chat-only primitives forward, at your
request. Folds and supersedes `docs/frontend/SESSION_RESTYLE_MIDPOINT_NOTES.md`
(deleted as part of this entry, per its own instruction to fold in once the rest
landed).

### Restyled (apps/web/components/ui/*)
Ported from the design file's `.btn* / .input,.select / .switch / .card / .chip /
.modal-scrim,.modal / .drawer / .tabs,.tab / .data-table / .tip-bubble` rules,
reading color/radius/shadow tokens from `theme.css`:
`button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `switch.tsx`, `select.tsx`
(trigger/value only; `SelectContent`/`SelectItem` untouched — agreed carve-out),
`card.tsx`, `badge.tsx`, `dialog.tsx`, `alert-dialog.tsx` (modal box only;
`AlertDialogAction`/`Cancel` restyled for free via `buttonVariants`), `sheet.tsx`
(start/end drawer sizing/surface only; top/bottom left at prior defaults, no
source data for those), `tabs.tsx`, `table.tsx`, `tooltip.tsx`.

### Design-source swap (done this delivery)
`docs/design/design-preview.html` replaced with the newer export (was
`openportal-theme-design.html`). Verified before swapping, not just asserted:
all 20 shared color values (10 hex + the `--gate-wash`/`--gate-wash-strong`
rgba pair, ×2 themes) are byte-identical between old and new, and `.bubble`/
`.msg-row`/`.composer` are unchanged — the new file only adds
`.bubble.error`/`.msg-actions`/`.msg-meta`/`.composer-meta` and a
`.t-h1…t-caption`/`.t-mono` typography scale that didn't exist in the old file
at all (not a change to something old, a genuinely new addition). `theme.css`'s
header comment updated with the new provenance note. No color token value
changed.

### Typography base (done this delivery — was item 2 on the "not yet built" list)
Added to `apps/web/styles/index.css`: `.t-h1/.t-h2/.t-h3/.t-body/.t-small/
.t-caption/.t-mono`, sizes/weights/line-heights copied 1:1 from the source;
colors point at existing semantic tokens (`--muted-foreground`,
`--faint-foreground`, `--accent-foreground`) rather than the source's raw
`--text-*`/`--gate-strong` names, since those aren't what's exposed here.

### Chat components — relocated, not re-ported
The midpoint notes' plan always called for `components/chat/*.tsx`, separate
from the `ui/` primitives folder. The zip that landed had them at
`components/ui/{message-bubble,message-actions,composer,chat-sidebar}.tsx`
instead. This delivery moves the 4 files to `components/chat/` (contents
unchanged). This wasn't a style preference: `message-bubble.tsx`'s own import
already read `from "@/components/chat/message-actions"` while the file sat in
`ui/` — a broken import that would have failed `tsc`/`next build` the moment
anything imported `MessageBubble`. Confirmed via repo-wide grep that nothing
imports any of the 4 files yet (chat route is still 2.1's placeholder), so the
move has no other call sites to update. Components themselves unchanged;
they're presentational-only per the confirmed scope, with local types (not
`packages/types`, which has no `Message` shape yet) and callback props ready
for real wiring in the chat phase.

### Toast provider — duplicate found and merged (not in either prior note)
Two files exported the same `AppToastProvider`: `providers/toast-provider.tsx`
(1.2's original, plain style using `--popover`/`--border`) and
`components/ui/toast-provider.tsx` (the restyled one, ported from
`.toast-region`/`.toast.success/.danger/.info`). `app/[locale]/layout.tsx` has
always imported from `providers/`, so the restyled copy was dead code — none
of its `.toast.*` tone classes were ever rendered. Fixed by merging the
restyled body into `providers/toast-provider.tsx` and deleting the
`components/ui/` copy. One behavior change worth flagging: position moved from
a `bottom-left`/`bottom-right` RTL split to `bottom-center` for both
directions, matching the source's actual rule (`inset-inline: 0`) — this is a
correction, not a new deviation.

### `--accent-strong` token — added (resolves a flagged gap)
`switch.tsx`'s checked-track color (`--gate-wash-strong` in the source) had no
matching token; it was approximated as `bg-primary/20`. Added `--accent-strong`
to `theme.css` (`:root`, `.dark`, and `@theme inline`) at the exact
`--gate-wash-strong` values (`rgba(185,121,31,.18)` light /
`rgba(217,164,65,.22)` dark — same values confirmed identical between the old
and new design files above), and switched `switch.tsx` to `bg-accent-strong`.
Straightforward additive token, no existing token's value touched.

### Frozen zone
Nothing in this delivery touches it — every change is under `apps/web/{styles,
components,providers}` or `docs/design/design-preview.html` /
`docs/frontend/*.md`.

### Not verified (no network/build in this sandbox — same standing gap)
- `next build`, `tsc`, lint, vitest, `i18n-parity` — none run.
- The Rule 2 eslint regex was re-read over the touched files by eye, not run
  for real.
- Visual result of the design-preview.html swap and the new typography classes
  — not rendered anywhere; only diffed textually against the old file.
- `bg-accent-strong` actually resolving (Tailwind v4 `@theme inline` token
  wiring assumed correct by pattern-matching the existing `--color-accent`
  line, not compiled).
- RTL check on `.t-mono`/toast `bottom-center` change, and the
  `components/chat/` move's effect on any path-based tooling (eslint
  `import/order`, etc. — none configured here that this session found, but
  not exhaustively checked).

### Carried forward from the midpoint notes, still open
- Real chat data-wiring (`useStreamingChat`, `TokenCounter`, conversations
  router) — explicitly out of scope, Phase 4/7/14 per the master plan.
- `sheet.tsx`'s hard-coded English `sr-only` close label — 2.1's known gap,
  still untouched.
- `button.tsx`'s `not-disabled:` variant — still unverified against a real
  build (Tailwind v3.4+/v4 syntax, not compiled here).
- Full preview pass owed: push to `frontend-v2`, check `/en/` and
  `/ar/dev/kitchen-sink`, both themes, plus manual RTL pass (drawer edge,
  composer send-button side, sidebar delete-icon reveal, new toast position).

### First CI push — build fix
`web-build` (`next build`, real vitest not needed here — this was a type error
caught at compile) failed: `components/chat/message-actions.tsx:30` —
`onClick={onRegenerate}` passes `(() => void) | undefined` into `IconButton`'s
own `onClick?: () => void`, and `exactOptionalPropertyTypes: true`
(`tsconfig.base.json`) forbids the explicit-`undefined` case on an optional
prop. Same class of error as 2.1's `nav-link-item.tsx` fix, missed here for
the same reason: this sandbox's `tsc` pass only covers `.ts` modules, no
React/Next types installed, so a JSX prop-assignability error like this one
doesn't surface until a real `next build`. Fix: `onClick={() => onRegenerate?.()}`,
matching the pattern already used one line below it for `onFeedback` and in
`message-bubble.tsx`. Everything else in the delivered files was clean on
this metric — traced every optional callback prop (`onCopy`, `onRegenerate`,
`onFeedback`, `onNewChat`, `onSend`, `onSelectConversation`,
`onDeleteConversation`) across all 4 moved files; this was the only
direct (unwrapped) pass-through of an optional value into a non-`undefined`-typed
slot. No other files in this delivery touch JSX prop typing.

---

## Wiring recheck — Phase 1.1 through 2.1 (out-of-band, requested after the
## "restyle" detour moved work back into 1.1 territory)

Full static cross-check of every seam between 1.1 (tokens), 1.2 (foundation),
2.1 (shell + guards) and the "restyle" session, since restyle went back into
1.1's file (`theme.css`) after 2.1 had already shipped and consumed it.
Checked, all consistent: `@theme inline` token mapping, `fonts.ts` ↔
`layout.tsx` wiring, `middleware.ts` ↔ `request-path.ts` ↔ `session.ts` ↔
`guards.ts` ↔ `(app)`/`(admin)` layouts, `config/nav.ts` ↔ actual page files
(cross-checked against `nav.test.ts`'s own existence assertion), i18n parity
(244/244, verified by parsing both message files, not just trusting the
note), Rule 2 compliance (scanned all 45 non-test `.tsx` files for
physical-direction classes by running the eslint rule's own pattern —
zero hits), and that both previously-logged CI type-error fixes
(`nav-link-item.tsx`, `message-actions.tsx`) are actually present in the
files, not just described.

### Bug found and fixed: `theme-presets.css` drift
`styles/theme-presets.css` says its values are "kept in sync manually" with
`theme.css`, but the restyle session's `--accent-strong` addition to
`theme.css` (:root and .dark) never made it into the `[data-theme-preset="gateway"]`
blocks. Not a live bug today — a property a more-specific/later rule doesn't
redeclare still cascades from `:root`/`.dark` on the same element, so
`switch.tsx`'s checked-track color rendered correctly regardless. It would
have become a real bug the moment 7.2 added a 2nd/3rd preset (that preset's
block would have had no `--accent-strong` at all and silently inherited
gateway's value instead of its own). Fixed: added `--accent-strong` to both
blocks, values copied verbatim from `theme.css` (`rgba(185, 121, 31, 0.18)`
light / `rgba(217, 164, 65, 0.22)` dark). Re-diffed every token in both
files programmatically after the fix — zero missing keys, zero value
mismatches in either theme, light or dark. Header comment in
`theme-presets.css` updated with a note explaining the drift for whoever
adds the 2nd preset in 7.2.

### Not verified (no network/build in this sandbox — standing gap)
`next build`, `tsc`, real ESLint, vitest, `i18n-parity` script — none run
for this recheck either. Everything above was verified by direct file
inspection, and the i18n/Rule-2 checks were run as actual scripts against
the real files (not spot-checked by eye), but nothing here compiles or
executes the app. Push and confirm CI green as usual.

---

## Session 2.2 — Shell widgets + states

### What landed
`BalanceWidget`, `AccountMenu`, `LanguageSwitcher`, `ThemeToggle` (drafted
elsewhere, checked and wired here) plus `RouteError`/`RouteLoading`/
`RouteNotFound` and the six thin `error.tsx`/`loading.tsx`/`not-found.tsx`
wrappers for `(app)` and `(admin)`. `trpc-query-provider.tsx` now sets
`throwOnError: isUnauthorizedError` (+ a matching `retry` guard so a 401
isn't retried 3× before it's rethrown) — closes 2.1's known gap (session
expiring while the tab stays open). `app-shell.tsx`'s header is no longer
`md:hidden`-only: it's now the permanent header on every breakpoint (the
desktop sidebar has no footer/account area to put these in), with the
menu-button + app-name pair staying mobile-only inside it.

### Bugs found in the drafted files, fixed before wiring in
- `trpc-error_test.ts` was named with an underscore.
  `vitest.config.ts`'s `include` is `**/*.test.ts` — this test would have
  silently never run in CI (green build, zero coverage of the auth-error
  predicate). Renamed to `trpc-error.test.ts`, contents unchanged.
- `balance-widget.tsx` declared a `compact` prop (doc comment: "drop the
  unit label and the 'Soon' badge to stay narrow") but never read it in
  the JSX — the unit label and badge always rendered regardless. Fixed:
  both are now conditional on `!compact`, and compact mode also tightens
  padding (`px-2 py-1` vs `px-3 py-1.5`) so it actually reads as a mobile
  variant. Verified by inspection only (see "Not verified" below) — this
  should be the first thing eyeballed on a real 360px preview.

### Message keys added (`ar.json`/`en.json`, 244→251 keys each, parity
verified by script — not just by eye)
`shell.accountMenu`, `shell.signedInAs`, `shell.language`,
`errors.notFoundTitle`, `errors.notFoundMessage`, `errors.backToChat`,
`common.tryAgain`. Inserted after the existing last key in each touched
object so the diff is a pure addition, nothing reordered.

### Deviations from the plan (flagged in the phase summary, unchanged
here)
- Theme preset picker not built — 1.1 shipped exactly one preset; a
  picker with one option is UI theatre. Becomes real in 7.2.
  `ThemeToggle` ships light/dark/system only.
- `BalanceWidget`'s implicit "Add credits" affordance and
  `AccountMenu`'s "Settings" link both read `config/nav.ts`'s own
  `enabled` flag (`billing`/`settings`) rather than a second "is this
  built yet" flag — same pattern `nav-link-item.tsx` already uses.
- `StatusBanner` not built, per the plan's own text (F11) — restore only
  when `/api/status` is real.

### Frozen zone
Nothing in this delivery touches it. Every changed/added file is under
`apps/web/{app,components,lib,providers,messages}`; `lib/trpc-error.ts`
is a NEW file in `lib/` (allowed — the frozen list is specific named
files: `auth`, `auth-client`, `trpc`, `redeem`, `generate-code`,
`turnstile-server` — `trpc-error.ts` isn't one of them and doesn't touch
any of them). `app/api/**`, `server/**`, `middleware.ts`, `i18n/request.ts`,
`next.config.ts` — untouched.

### Not verified (no network/build in this sandbox — standing gap)
- `next build`, `tsc`, real ESLint, vitest, `i18n-parity` script — none
  run. The i18n parity check above WAS run for real (a script diffing the
  actual flattened key sets, not eyeballed), and the Rule 2
  physical-direction-class grep was run against every touched file
  (zero hits) — both call out explicitly above since most of this note's
  other claims are inspection-only.
- The `compact` fix and the new always-on desktop header — not rendered
  anywhere. A 360px and a ≥768px preview pass is the real verification;
  static reading only confirms it's *wired*, not that it *looks* right
  (e.g. whether `ms-auto` actually pushes the widget cluster to the
  inline-end on both a `md:hidden`-collapsed mobile header and a full
  desktop one — plausible from the CSS, unconfirmed visually).
- `DropdownMenuItem`'s `disabled={!settingsEnabled} asChild={settingsEnabled}`
  pattern in `account-menu.tsx` (conditional `asChild` based on a runtime
  flag) — Radix's `Slot` behavior here is assumed correct by reading the
  primitive's source, not exercised in a real browser.
- Whether react-query v5's `throwOnError` signature genuinely ignores the
  second (`query`) argument when handed a plain `(error) => boolean)`
  predicate like `isUnauthorizedError` — matches the documented type,
  not run.
- `getLocale`/`getTranslations` from `next-intl/server` in
  `route-not-found.tsx` as an async Server Component default-exported
  straight into `not-found.tsx` — pattern matches existing usage
  elsewhere in the repo (`chat/page.tsx`, `admin/page.tsx` both import
  `getTranslations` the same way), not independently compiled.

### Carried forward, still open
- Full preview pass owed: `/ar/` and `/en/`, both themes, 360px and
  desktop — mobile drawer + new header coexisting, zero-balance state,
  low-balance amber state, sign-out → login, forced-401 → session-expired
  `error.tsx` branch (not the generic one), `/ar/chat/does-not-exist` →
  in-shell 404.
- `sheet.tsx`'s hard-coded English `sr-only` close label — 2.1's known
  gap, still untouched (unrelated to this session).

### Web Build — first CI run result and fix (2.2 continuation)
Red on first push (`web-build`, real `next build`, not a sandbox-only
prediction this time). Both `(app)/error.tsx` and `(admin)/error.tsx`
failed: `must be a Client Component. Add the "use client" directive the
top of the file to resolve this issue.` Root cause: Next's app-router
compiler checks for the `"use client"` directive in the boundary file
itself — `error.tsx` is special-cased to require it locally, regardless
of whether the component it re-exports (`RouteError`, in
`components/layout/route-error.tsx`) already has the directive one file
up the import graph. `export default RouteError;` from a plain server
module doesn't inherit it. `loading.tsx`/`not-found.tsx` didn't hit this
— those wrap server components (`RouteLoading`, `RouteNotFound`), which
`error.tsx` alone requires client-side.

Fix: added `"use client";` as the first line of both `error.tsx` files
(3 lines including the blank line before the doc comment). No change to
`route-error.tsx` itself (already had the directive) or to either
`loading.tsx`/`not-found.tsx` pair. This was flagged as an explicit "not
verified" item in the previous note ("Whether react-query v5's
`throwOnError`... not run" section didn't call this specific case out,
but the broader "no `next build` run here" caveat did) — first real
build catches exactly the class of error that sandbox inspection can't:
this is a file-identity rule (Next reads THIS file's top, not the
transitive graph), not something a static read of the import would
surface without knowing that rule already.

---

## Session 3.1 — Auth pages

### What landed
`login`, `register`, `verify`, `forgot`, `reset` as real pages under
`app/[locale]/(auth)/auth/`. `login`: email/password, inline TOTP/
backup-code step on `data?.twoFactorRedirect` (no separate route, per
`lib/auth-client.ts`'s own comment), `?next=` respected via
`resolvePostLoginTarget`. `register`: email/displayName/password/
confirm/terms-checkbox, live password-rule checklist, Cloudflare
Turnstile (script-tag widget, no new npm dependency —
`components/auth/turnstile-widget.tsx`), `?ref=` capture forwarded as
`x-referral-code`. `verify`: waiting screen + resend with a 60s
client-side cooldown (the actual verification happens when the emailed
link hits better-auth's own `/api/auth/verify-email` route directly —
this page never calls a "verify" method itself). `forgot`/`reset`: email
→ token-bearing link → new password, with the same enumeration-safe
"we sent it" copy regardless of whether the email exists.

New shared, non-page files: `lib/password-rules.ts` (+ test) mirroring
the server's 3 password rules; `lib/map-auth-error.ts` (better-auth
error → `auth.errors.*` key); `components/auth/{form-error-banner,
password-rule-row,turnstile-widget}.tsx`.

`lib/guards.ts` gained `decideAuthGuard` (+ tests appended to
`guards.test.ts`, existing tests untouched): a signed-in visitor to any
`/auth/*` page is bounced to `/{locale}/chat` — closes the "no session
check here — 3.1 decision" gap `(auth)/auth/layout.tsx`'s own comment
flagged back in 2.1/2.2. `guards.ts` is NOT on the frozen list (only
`auth`/`auth-client`/`trpc`/`redeem`/`generate-code`/`turnstile-server`
are), so this is an in-bounds edit, not a frozen-zone violation.

### Deliberate scope cuts, flagged rather than silently dropped
- No password show/hide toggle — no such primitive exists in
  `components/ui`, and building one wasn't worth it for this phase.
  Plain `<Input type="password">`.
- No `Checkbox` UI primitive exists either — the terms checkbox on
  `register` is a native `<input type="checkbox">` with `accent-primary`
  styling instead of a new shadcn component.
- `decideAuthGuard` does NOT preserve `?next=` when bouncing an
  already-signed-in visitor away from `/auth/*` (unlike
  `decideAppGuard`/`decideAdminGuard`, which do). Route-group layouts
  don't receive `searchParams` in the App Router — only `page.tsx` does
  — so preserving it here would need restructuring where the guard runs.
  Landing on `/auth/*` while already signed in is an edge case (stale
  tab, back button), not the common path; the common
  "signed-out-hits-protected-page" path still preserves `next` correctly.
  Full reasoning is in `decideAuthGuard`'s own doc comment.
- zod's built-in validation messages (`"Invalid email"`, `"String must
  contain at least 1 character(s)"`) are NOT translated — they'd show in
  English even on the Arabic form. This matches the existing precedent
  already in the codebase (`kitchen-sink-client.tsx`'s `DemoForm` does
  the same — hardcoded English zod messages, never localized), so it's
  consistent with current practice rather than a regression, but it IS a
  real Arabic-locale rough edge worth fixing at some point: building
  translated zod schemas needs a schema *factory* function called with
  `t` inside the component (schemas can't call `useTranslations` at
  module scope), which no page here does. Only shows up on genuinely
  invalid input (empty email, malformed email) — the common "wrong
  password" / "weak password" / "emails don't match" paths all use
  hand-written `form.setError(...)` calls with real translated copy, not
  zod's defaults.

### Not verified (no network/node_modules in this sandbox — standing gap)
- **Highest-risk item**: `signUp.email(body, { headers: {...} })` — the
  second-argument shape for attaching `x-turnstile-token`/
  `x-referral-code` to a better-auth client call. This is the documented
  better-auth pattern from training knowledge, and `lib/auth.ts`'s own
  comment ("see the client call in auth/register/page.tsx for the
  matching side of this") implies whoever wrote the server hook expected
  exactly this shape — but it was not checked against this pinned
  version's actual TypeScript types (no `node_modules` here). If wrong,
  it is a single call site (`register/page.tsx`'s `onSubmit`) to fix,
  and it would fail loud (registration errors visibly) rather than fail
  silent (never passes as a security bypass — worst case Turnstile/
  referral just don't get attached and the server-side Turnstile check
  fails closed if `TURNSTILE_SECRET_KEY` is set).
- `data?.twoFactorRedirect` on `signIn.email`'s return type, and
  `twoFactor.verifyTotp`/`twoFactor.verifyBackupCode` method names —
  matches `lib/auth-client.ts`'s own comment closely, not independently
  compiled.
- `error.code === "USER_ALREADY_EXISTS"` — plausible better-auth code
  for a duplicate-email sign-up, not confirmed. Falls through to the
  generic error message if wrong; doesn't break the flow.
- `requestPasswordReset`/`resetPassword` argument shapes
  (`{email, redirectTo}` / `{newPassword, token}`) and whether
  `requestPasswordReset` really is enumeration-safe (returns success
  whether or not the email exists) on this pinned version — assumed from
  standard better-auth behavior, not confirmed.
- `next build`/`tsc`/real ESLint/vitest — not run. The i18n parity check
  (script, not eyeballed: 251→272 keys, both locales, diffed
  programmatically) and the Rule 2 physical-direction-class grep (zero
  hits across every new file) WERE run for real.
- Turnstile widget rendering itself (`components/auth/turnstile-widget.tsx`)
  — the `window.turnstile.render()` call shape is standard Cloudflare
  docs, not exercised against a real site key in this sandbox (no
  network). Its no-site-key fallback path (skip rendering, report a
  placeholder token) is what a preview without `TURNSTILE_SECRET_KEY`
  configured will actually exercise — untested end-to-end either way.

### Message keys added (`ar.json`/`en.json`, 251→272 keys each on top of
2.2's already-delivered files — NOT the pre-2.2 repo snapshot; parity
verified by script)
`auth.verifyResendIn`, `auth.verificationSent`,
`auth.{forgotTitle,forgotMessage,sendResetLink,resetTitle,resetMessage,
resetButton,resetInvalidToken}`,
`auth.{totpTitle,totpMessage,totpCode,backupCode,useBackupCode,
useAuthenticatorApp,verifyButton,backToLogin}`,
`auth.passwordRules.{minLength,uppercase,digit}`, `auth.errors.suspended`
(currently unused by any page — better-auth's sign-in doesn't itself
block a suspended account, `users.status` suspension is enforced later
by the API's chat middleware per `lib/auth.ts`'s own comment — added
per the plan's error-copy list, will get a real caller once that surface
exists, e.g. Phase 3.2's chat error handling).

### Frozen zone
Untouched: `app/api/**`, `server/**`, `middleware.ts`, `i18n/request.ts`,
`next.config.ts`, and all six named frozen `lib/*.ts` files
(`auth.ts`, `auth-client.ts`, `trpc.ts`, `redeem.ts`, `generate-code.ts`,
`turnstile-server.ts`) — read for reference, never edited. `guards.ts` is
edited (in-bounds, see above). All new `lib/` files
(`password-rules.ts`, `map-auth-error.ts`, plus their tests) are new
files, not edits to a frozen one.

### Carried forward, still open
- Full preview pass owed once this deploys: register → Turnstile widget
  renders (or gracefully no-ops without a site key) → verify screen
  shows the right email → click the real emailed link → lands
  auto-signed-in per `autoSignInAfterVerification: true` → login with
  that seeded account → logout (closes the loop 2.2 couldn't verify
  without this phase). Separately: a 2FA-enabled test account through
  login → TOTP step appears → correct code succeeds, wrong code shows
  `errors.invalidCredentials`-mapped copy, "use backup code" swaps the
  input without losing the entered value's field label. Forgot → check
  inbox → reset link → new password → redirected to login → sign in
  with the new password.
- zod default-message localization (see "Deliberate scope cuts" above)
  — not this phase, flagged for whoever picks up form-validation
  polish, `kitchen-sink-client.tsx`'s `DemoForm` has the same gap.
- `sheet.tsx`'s hard-coded English `sr-only` close label — 2.1's known
  gap, still untouched (unrelated to this session).

### First real build result and fixes (3.1 continuation)
Red on push (`Type-check & Lint`, real `tsc`, plus `next build`'s own
type-check step failing the same way): 11 errors, all from two root
causes — both were explicitly called out as "not verified" in the
original 3.1 delivery note above, now confirmed for real by the compiler
rather than left as a guess.

1. **`mapAuthError`'s parameter type was too strict under
   `exactOptionalPropertyTypes: true`** (this repo's tsconfig has it on).
   better-auth's real error type is
   `{ code?: string | undefined; message?: string | undefined; status:
   number; statusText: string }` — under that flag, an optional property
   typed as exactly `string | undefined` is NOT assignable to a
   parameter typed `code?: string`, even though every actual runtime
   value is fine; the flag is about the *type*, not the *value*. Hit all
   6 call sites (`login` ×2, `register`, `verify`, `forgot`, `reset`).
   Fix: `mapAuthError`'s parameter is now `unknown`, cast internally —
   sidesteps needing to guess the exact optional-field shape a second
   time; a future shape change fails soft (generic message) instead of
   failing the build again.
2. **`data?.twoFactorRedirect` on `signIn.email`'s return type doesn't
   exist** — confirmed the real inferred success type has no
   `twoFactorRedirect` branch (`Omit<{ redirect, token, ... }>`).
   `lib/auth-client.ts`'s own comment describing this exact check was
   evidently either aspirational or matches a different better-auth
   version than what's actually installed. Fix: read it through an
   explicit `as unknown as {twoFactorRedirect?: boolean}` cast in
   `login/page.tsx` — changes nothing about the runtime check (the
   frozen file's comment is still the source of truth for the actual
   2FA response shape), only satisfies the type checker, since `"x" in
   data` narrowing can't add a property no branch of the real type has.

No other files touched for this fix — both root causes were isolated to
`lib/map-auth-error.ts` (1 file) and `login/page.tsx` (1 check). This is
exactly the "fails loud, one call site to fix" outcome the original note
predicted for the `signUp.email(body, {headers})` risk too, which did
NOT show up as a build error here — either that shape is actually
correct, or it simply hasn't been exercised yet (only type-checked,
never run against a live Turnstile submission). Still flagged as
unverified until a real registration attempt goes through Turnstile.

### Second real build result and fix (3.1 continuation, round 2)
Red again after the first fix — different root cause this time, in a
file the first round didn't touch. `register/page.tsx:93`:
`values.displayName || values.email.split("@")[0]` — `Type 'string |
undefined' is not assignable to type 'string'`. This tsconfig also has
`noUncheckedIndexedAccess` on (confirmed by this error, not previously
known): array/string index access is typed `T | undefined` regardless
of how confident the code is that the index is in bounds, so
`.split("@")[0]` is `string | undefined`, not `string` — the `||`
fallback only handled `values.displayName` being undefined, not the
split result also being (type-wise) possibly undefined.

Fix: extracted `emailLocalPart = values.email.split("@")[0] ?? values.email`
as its own step, so there's an explicit fallback guaranteeing a plain
`string` before it ever reaches `signUp.email`'s `name` field. Runtime
behavior is unchanged — zod's `.email()` already guarantees
`values.email` is non-empty, so the `?? values.email` branch is there
for the type checker, not because the split is expected to fail.

Proactively grepped the rest of this delivery for the same pattern
(`[0]`, `[1]`, `.split(`, and dynamic bracket-key access generally)
before resubmitting — one other hit, in `guards.test.ts`'s
`it.each([[...]])` table, which isn't index access into a typed array
of my own (vitest consumes it via its own typed callback params), so it
doesn't trip the same rule. Nothing else in this delivery indexes into
an array or split result.

Both `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` being
on were not known going in — flagging for whoever next writes
TypeScript against this repo: assume both strict flags are live rather
than rediscovering them build-by-build. If a third strict flag surfaces
the same way, it's likely `noImplicitOverride` or similar; worth asking
to see the actual `tsconfig.json` directly next time rather than
inferring it error-by-error.

### Third real build result and fix (3.1 continuation, round 3)
Red again, one file: `components/auth/turnstile-widget.tsx:56`, same
`'string | undefined' is not assignable to 'string'` shape as round 2,
but a different mechanism. `const siteKey = process.env.NEXT_PUBLIC_...`
is `string | undefined`; the early `if (!siteKey) return null;` narrows
it for the rest of that render pass, but `renderWidget` is a *nested
function* declared afterward — TypeScript doesn't carry an outer
narrowing into a closure, because the closure could in principle be
invoked later (e.g. from an async callback) after something else has
changed. This is conceptually the same class of issue as round 2's
`noUncheckedIndexedAccess` fix (the compiler won't let control flow in
one place imply safety somewhere control flow can't prove is still
covered by it) but a different specific rule — closures vs. array
access — so grepping for `[0]`/`.split(` again wouldn't have caught it.

Fix: capture `const resolvedSiteKey: string = siteKey` immediately after
the guard, and reference that inside `renderWidget` instead of the
original `siteKey`. A `const` binding's narrowed type is permanent (it
can't be reassigned), so it survives into a closure where a `let` or a
plain parameter wouldn't.

Proactively grepped this delivery for the same closure pattern (any
nested `function` declaration referencing an outer guarded variable)
before resubmitting: two other nested functions exist
(`login/page.tsx`'s `finishLogin`, `verify/page.tsx`'s `startCooldown`)
— neither reads a variable that depends on a preceding narrowing guard,
so neither is at risk the same way.

Three real build failures in a row now, each a genuine type-safety gap
this environment's strict tsconfig catches and a plain read-through
review didn't — not repeats of the same mistake, but the same underlying
lesson: this tsconfig is stricter than base `strict: true` in ways that
aren't guessable from the code alone (`exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, and ordinary closure-narrowing limits all
surfaced only once each hit a real `tsc` run). Repeating the standing
ask: the actual `tsconfig.json` would let this get caught before a push
rather than after.

## Session 3.2 — Legal, landing, consent, e2e harness

### What landed
`features/legal/` (registry + read-doc + LegalDocView markdown renderer)
and `app/[locale]/(public)/legal/[doc]/page.tsx` — static (`generateStaticParams`)
English-only pages for the three documents named in the master plan's
Launch Checklist (terms, privacy, acceptable-use). `scripts/sync-legal.ts`
copies them in from `docs/legal/*.md` at build time, with a `--check`
mode wired into a new `legal-docs-sync` CI job so a stale copy fails the
build rather than silently shipping. `content/legal/*.md` are the real
copied files, not placeholders.

`features/landing/` replaces the placeholder `(public)/page.tsx` left by
2.1: header (reuses 2.2's LanguageSwitcher/ThemeToggle), hero, a live
model grid, a live package-pricing grid, and a footer that iterates
`LEGAL_DOCS` for its links. `features/consent/` adds a minimal
localStorage-backed cookie-notice banner — there are no non-essential
cookies anywhere in this codebase yet (grepped: no analytics/pixel
import exists), so it has nothing to ask consent for today; it exists so
turning on real analytics later is a copy change, not new banner
plumbing.

`register/page.tsx`'s `agreeToTerms` checkbox now links to the real
`/legal/terms` and `/legal/privacy` pages (`t.rich`, next-intl v4) — it
previously rendered plain unlinked text. Caught and fixed a real bug
while wiring this: both links sit inside a native implicit `<label>`
(no `htmlFor`/`id` pairing) that toggles the checkbox, so without
`stopPropagation()` on each link, clicking "Terms of Service" to *read*
it would have also silently checked the consent box. Fixed with
`e.stopPropagation()` on each `<Link>`'s `onClick` (not
`preventDefault` — the link still navigates normally).

`apps/web/styles/index.css` now registers `@plugin "@tailwindcss/typography"`
(Tailwind v4 CSS-based plugin loading — `tailwind.config.ts` doesn't
exist in this repo, deleted in 1.2). `@tailwindcss/typography` had been a
devDependency since 1.2 but nothing had ever used `prose` classes until
`LegalDocView` — found by checking, not assumed.

### The tRPC-server-caller correction (mid-session, on explicit instruction)
First draft of the landing page's data access (`lib/public-data.ts`) was
a hand-written mirror of `modelsRouter.list`/`billingRouter.listPackages`
directly against `@ai-platform/db` — flagged as a deviation in that
session's Phase Summary and initially approved, but on later explicit
instruction ("no hallucinations or hardcoded variables") this was
replaced with a REAL tRPC server caller instead, so the landing page can
never silently drift from what the actual router returns:

- `apps/api/src/routers/trpc.ts`: additive `export const
  createCallerFactory = t.createCallerFactory` — a stock tRPC v11 API,
  nothing else in the file changed.
- `apps/api/src/routers/index.ts`: additively re-exports
  `createCallerFactory` and `Context` alongside the existing `appRouter`.
- `apps/web/lib/trpc-server.ts` (new): `publicCaller`, built from
  `createCallerFactory(appRouter)` with a synthetic
  `{ db, user: null, ip: "server" }` context. `user: null` is not a
  stand-in for "figure out who's signed in" — every call site is
  `publicProcedure` and genuinely anonymous, so asserting that honestly
  is correct, not a shortcut. Do not reuse `publicCaller` for a
  `protectedProcedure` call — it will always throw `UNAUTHORIZED`, by
  design.
- `lib/public-data.ts` deleted entirely; `model-grid.tsx`/`package-grid.tsx`
  now call `publicCaller.models.list()` / `publicCaller.billing.listPackages()`.

Every field access in `model-grid.tsx`/`package-grid.tsx` was checked
against the actual router source line-by-line (not memory) before this
was called done — `models.router.ts`'s `list` procedure's `.map()`
shape and `billing.router.ts`'s `listPackages`' raw-row return were both
re-read in full during this pass.

Caught two things this change would otherwise have shipped broken:

1. **Build-breaking.** The landing page now reads live DB data via a
   Server Component with no `cookies()`/`headers()`/`searchParams` call
   anywhere in its render path — nothing signals Next.js the route is
   request-dependent, so its default static-rendering heuristic would
   try to prerender `/` at `next build` time. CI's `web-build` job uses
   a deliberately unreachable placeholder `DATABASE_URL`
   (`postgres://placeholder:placeholder@localhost:1/unused`), so this
   would either bake a stale build-time price/model snapshot into the
   deploy or fail the build outright depending on timing. Fixed with
   `export const dynamic = "force-dynamic"` on `(public)/page.tsx` —
   which is also just the *correct* choice independent of the CI
   concern: a page showing live prices shouldn't be statically cached
   across deploys.
2. **Unverified dependency.** First draft of `lib/trpc-server.ts`
   imported `"server-only"` on the assumption Next.js vendors it
   transitively. Checked: it's not a declared dependency anywhere in
   this repo (`package.json`/`pnpm-lock.yaml`), and no existing file
   imports it — `lib/session.ts`, the closest analogous "server-only,
   opens DB" file, relies on a doc comment instead
   ("Server components only... importing ./auth pulls in the database
   client"). Removed the import; `trpc-server.ts` follows that same
   existing convention instead of adding an unverified new package.

### A real, pre-existing architectural characteristic this surfaces (not a new bug, but a new blast radius)
`apps/web/server/router.ts` (frozen, pre-existing, unrelated to this
session) already does `export { appRouter } from "@ai-platform/api/routers"`
— meaning production already, today, before this session touched
anything, requires the *entire* `apps/api/src/config.ts` env-var surface
(`REDIS_URL`, `GATEWAY_URL`, `GATEWAY_MASTER_KEY`, `GATEWAY_ROOT_TOKEN`,
`INTERNAL_SERVICE_TOKEN`, `RESEND_API_KEY`, `CODE_SALT`, etc.) just to
serve `/api/trpc/*`, because `modelsRouter.list`'s router file
(`models.router.ts`) imports `model-sync.service.ts`, and
`adminRouter`'s file imports `gateway-channels.service.ts` — both of
which import `apps/api/src/config.ts` at module scope (confirmed by
direct grep + read, not assumed), and that module `throw`s at import
time if `envSchema.safeParse(process.env)` fails.

What Phase 3.2 changes: `lib/trpc-server.ts` is now imported by
`ModelGrid`/`PackageGrid`, which render on the **public landing page**.
Before this session, only requests that actually hit `/api/trpc/*`
(client-side calls, all behind some page needing tRPC) triggered that
env validation. Now the landing page — the one surface a signed-out,
first-time visitor sees — transitively requires it too. A misconfigured
`RESEND_API_KEY` or `CODE_SALT` in Vercel's env, today, would only break
authenticated/tRPC-dependent features; after this change, it would 500
the marketing homepage as well.

This is flagged here rather than silently patched because a real fix
(splitting `models`/`billing`'s public procedures into a router with a
narrower import graph than `apps/api/src/config.ts`, or making that
config's schema tolerant of a "public-read-only" mode) means editing
`apps/api/src/config.ts` and/or the router file boundaries — a shared,
sensitive backend file, out of a frontend session's remit to change
unilaterally. Recommending this as a scoped follow-up for whichever
session next touches `apps/api`'s router structure. Until then: **the
`e2e` CI job below supplies the full placeholder env surface (same list
as `web-build`) specifically because of this**, not because
`apps/web`'s own code needs any of those values.

### e2e harness — what it does and, importantly, does NOT boot
First Playwright harness in this repo: `playwright.config.ts`,
`e2e/login.spec.ts` (sign-in happy path + wrong-password path),
`e2e/landing.spec.ts` (live model data renders; packages section
handles the empty-seed-data case without erroring; legal footer link
navigates correctly).

Confirmed by reading the actual code, not assumed: **only `apps/web`
needs to boot for these specs — not the separate `apps/api` Fastify
server on `:4000`.** `apps/web/app/api/trpc/[trpc]/route.ts` calls the
shared `appRouter` in-process via `fetchRequestHandler` (no HTTP call
out to `:4000`), and `apps/web/lib/auth.ts`'s `betterAuth()` instance
talks to Postgres directly via `drizzleAdapter(db, ...)` — also
in-process. Login and the landing page (this phase's two new surfaces)
never exercise anything that lives only in `apps/api`'s standalone
process (chat streaming, the New API gateway proxy, BullMQ jobs). A
later phase adding an e2e spec for chat itself would need to add
`apps/api` back into this harness.

Seed data used: `packages/db/src/seed.ts`'s `user@localhost.dev` /
`User123!` (confirmed `emailVerified: true` in that file, so login isn't
blocked on verification) for `login.spec.ts`; `seed-models.ts` (a
**separate** script from `seed.ts` — not run by it) for
`landing.spec.ts`'s model-grid assertion, seeding
`@ai-platform/config`'s `MODEL_CATALOG` with `status="published"` (the
`models` table's column default) and `isAvailable=true` on first insert.
Asserted model: "GPT-4o", `MODEL_CATALOG`'s first entry's `displayName`
— read verbatim from `packages/config/src/models.config.ts`, not
guessed.

**No seed script for the `packages` (credit packages) table exists
anywhere in this repo** — checked directly, the only writes to
`creditPackages` are `admin.router.ts`'s runtime CRUD procedures, none
at seed time. A fresh CI database therefore has zero rows there, and
`PackageGrid` correctly renders its empty-state message. `landing.spec.ts`
asserts that either real package cards OR the empty-state message is
present — asserting real cards would have been testing against data
that provably does not exist in this environment, exactly the kind of
unverified assumption this correction round was asked to eliminate.
Flagging this as a gap worth a small seed addition (or an admin-UI-driven
fixture) in whichever phase builds `/admin/packages`.

New CI jobs added to `.github/workflows/deploy.yml`:
- `legal-docs-sync` — runs `sync-legal.ts --check`.
- `e2e` — `postgres:16-alpine` service container (not Testcontainers,
  unlike `api-tests` — this job needs the DB reachable from the actual
  `next start` process, not from inside a single test runner process),
  `DATABASE_SSL=disable` (same precedent already established in
  `apps/api/src/test/testDb.ts`'s own comment: "packages/db forces TLS
  unless DATABASE_SSL=disable; the container has [no TLS]"), migrate →
  seed → seed:models → `next build` → `playwright test`. Uploads the
  Playwright HTML report as a build artifact on failure.

### What I could not verify without running the code
- Nothing in this session's build was run through actual `tsc`,
  `next build`, `vitest`, or `playwright test` — no `node_modules` are
  installed in this sandbox and no network access is available to
  install them. Every claim above about what compiles, what a router
  returns, what a schema column defaults to, and what CI job env vars
  are required was checked by reading the actual source files directly
  (cited inline above), not inferred from memory or convention — but
  "checked by reading source" is not the same guarantee as "checked by
  running the code," and the standing ask from earlier sessions (get a
  real `tsc`/`next build` pass and report back what breaks) still
  applies here as much as it did in 3.1.
- `@playwright/test`'s pinned version (`^1.48.0`) is a reasonable, widely
  current version at the time of writing but was not checked against
  the npm registry (no network access) — verify this resolves to a real,
  current version before merging, and bump if a newer one is preferred.
- The `e2e` job's full placeholder-env-var list is copied from
  `web-build`'s existing block on the reasoning documented above (the
  `appRouter` import graph needs them to be syntactically valid, not
  reachable) — this reasoning was checked by reading `config.ts`'s Zod
  schema and every transitively-imported service file's own imports,
  but was not confirmed by actually booting `apps/web` against them in
  this sandbox.
- Whether Vercel's ACTUAL production/preview env for `apps/web` already
  has every one of `apps/api/src/config.ts`'s required vars set (as the
  "pre-existing, not new" argument above assumes) was not independently
  re-verified this session — it's inferred from `web-build`'s existing
  CI env block needing the same list, which was presumably set that way
  because production needs it, but that inference should be confirmed
  against the real Vercel project settings before relying on it further.

### Web Build — first real result and fix (3.2 continuation)
Vercel build red, one error: `playwright.config.ts:35` TS2769, `workers:
number | undefined` not assignable to `string | number`. Cause:
`workers: process.env.CI ? 1 : undefined` under `exactOptionalPropertyTypes:
true` (inherited from `tsconfig.base.json`). Same class as the 3.1 round-1
fixes: an explicit `undefined` is not allowed for an optional key. The CI
`check` (`pnpm type-check`) and `web-build` jobs hit the same file/error;
Vercel was just where it surfaced. Next's build only prints the first type
error.

Fix: `...(process.env.CI ? { workers: 1 } : {})`, so the key is omitted
locally and Playwright uses its default. Added `apps/web/.gitignore`
(`playwright-report/`, `test-results/`, `blob-report/`) so local e2e runs
don't dirty the tree.

Verified here: reproduced the exact error, then confirmed
`playwright.config.ts` + `e2e/*.spec.ts` type-check clean, using the repo's
strict flags (`strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`) against Playwright **1.56** types.

Not verified: Playwright 1.63.0 types (what Vercel resolved); the rest of
apps/web under `tsc` (no node_modules/network); whether `next start` with
`output: "standalone"` serves correctly in the `e2e` job (Next warns for
this pairing; left as is unless it fails). The `e2e` job has never run: it
failed at its own `next build` step on this error, so its first real result
is still pending.

Plan copies: the uploaded plan (2.2/3.1 checked) was treated as canonical.
The repo's `docs/FRONTEND_REBUILD_PLAN.md` differs (2.2/3.1 unchecked, D1
decided, 2.1 carry-over list) and was not edited; reconcile the two.

### Legal pages 500 on preview — `DYNAMIC_SERVER_USAGE` (3.2 continuation, round 2)
Build and CI green, but `/{en,ar}/legal/{terms,privacy,acceptable-use}`
returned 500. Vercel runtime log (all six URLs, function
`/[locale]/legal/[doc]`): `digest: 'DYNAMIC_SERVER_USAGE'`.

Cause: `middleware.ts` (custom, not next-intl's) hands the locale to
next-intl via the `x-next-intl-locale` header, so `requestLocale`
(`i18n/request.ts`, frozen) calls `headers()` unless `setRequestLocale()`
ran first. `LocaleLayout` calls `getMessages()` without it, and the page's
`generateStaticParams` returned only `{ doc }` (no `locale`), so nothing was
prerendered at build; the first request then rendered the route as
static-on-demand, where `headers()` throws. It passed `next build` and the
`e2e` job (which uses `next start`, a different runtime path than Vercel),
so neither could catch it.

Fix (no frozen file touched):
- `legal/[doc]/page.tsx`: `generateStaticParams` emits locale × doc (6
  pages), `setRequestLocale(locale)` at the top of the page,
  `dynamicParams = false` (no on-demand render path can exist).
- `app/[locale]/layout.tsx`: `setRequestLocale(locale)` before
  `getMessages()` (next-intl's documented static-rendering requirement).

Guard: the six pages are now prerendered during `next build`, so any other
`headers()`/`cookies()` use in that tree fails the `web-build` job with the
offending route named, not a production 500. `content/legal` is read at
build time (cwd = apps/web) instead of by a function at request time, which
also removes a Vercel file-tracing risk for `readFileSync`.

Not verified (no node_modules here): that the build now prerenders all six
pages (check the `next build` route table shows `● /[locale]/legal/[doc]`
with `/en/legal/terms` etc. listed); that nothing else in the tree reads
request headers; Vercel behaviour itself. Standing gap: e2e runs on
`next start`, so it cannot reproduce Vercel-only rendering failures;
verification for those is the preview URL.

### Phase 3.3 — Landing page polish (constellation, calculator, table, demo)

**Scope.** Landing page rebuild per this phase's plan: constellation dot
background in the hero, shimmer sign-up CTA, scroll-reveal on every
section, animated stat counters (real model count + placeholder total
users), a searchable/filterable models table (replaces card grid),
LiveBench click-to-load embed, a "how far does 1,000 YER go" calculator,
a payment-methods marquee, a comparison table, and a simulated demo
section.

**Files added** (all under `apps/web/`):
- `components/ui/reveal.tsx`, `components/ui/animated-number.tsx`,
  `components/ui/shimmer-button.tsx`
- `features/landing/types.ts`
- `features/landing/lib/{pricing,format-price,safe-url,constellation,
  count-up,demo-content,build-landing-data,landing-data,
  get-demo-content}.ts` (+ matching `.test.ts` for the pure modules)
- `features/landing/config/{model-tags,placeholders}.ts` (+ tests)
- `features/landing/components/{constellation-background,models-table,
  models-section,stats-strip,pay-per-use-calculator,calculator-section,
  livebench-embed,livebench-section,payment-marquee,comparison-table,
  comparison-section,demo-section,demo-section-wrapper,
  packages-section,landing-intro}.tsx`
- `content/demo/simulated-chat.json` — **invented numbers**,
  `simulated: true`. To go real: run one actual chat, copy its real
  prompt/reply and the real input/output tokens + cost from the billing
  usage log, then flip the flag. Until then the demo section always
  shows a "Simulated example" badge (`demo-content.ts`'s own doc is the
  source of truth for the exact contract).

**Files deleted:** `features/landing/components/model-grid.tsx` and
`package-grid.tsx` (3.2 card grids, superseded by `models-table.tsx` +
`models-section.tsx` and `packages-section.tsx`). Confirmed no remaining
imports of either before deleting.

**`index.tsx` rewritten** as the composition root: one `getLandingData()`
call per page load (was two independent tRPC calls in 3.2, one per
grid), sections receive plain props, no section fetches its own data.

**Messages:** 87 new `landing.*` keys added to both `ar.json` and
`en.json`, verified at parity (script-checked key-set equality, not by
eye). Pre-existing keys `modelsHeading` / `packagesHeading` /
`noPackagesAvailable` were deliberately left byte-identical so
`e2e/landing.spec.ts`'s existing string assertions keep passing
unmodified.

**Framer Motion decision.** A prior round of this phase had dropped
framer-motion (declared but unused, v11 predated React 19). This round
reverses that: `framer-motion@^11.11.0` (already in package.json) does
support React 19, and `Reveal`/`ShimmerButton` both use it now
(`useReducedMotion`, `whileInView`). `AnimatedNumber` and the
constellation canvas stay hand-rolled (rAF + IntersectionObserver, no
motion library) since neither needed anything framer-motion offers over
plain JS. Not re-verified against a real `npm install` — declared
compatibility, not measured here.

**"Magic UI".** Not an installed dependency in this repo (no
`magicui`/`magic-ui` reference anywhere, no `components.json`/shadcn
registry config to add it through). Magic UI ships as copy-in source
(React+Tailwind+Framer Motion), so "using" it here meant hand-porting
the same techniques — `shimmer-button.tsx` mirrors their shimmer-button
pattern, `reveal.tsx` mirrors their `blur-fade` — restyled against this
repo's own theme tokens (`--primary`/`--foreground`, not Magic UI's
default indigo/violet) rather than installed as-is.

### Frozen-zone change: `middleware.ts` bare-`/` redirect (explicit sign-off)

**Contradiction found before building further** (per this phase's own
rule: stop and report before proceeding if the plan contradicts the
code). An earlier round of this phase had asserted, and gotten sign-off
on, "`middleware.ts` (frozen, approved): `/` redirects to `/{locale}`
(landing)." This was **wrong** — the actual frozen file and its
already-passing test both redirected bare `/` to `/{locale}/chat`, not
`/{locale}`. Flagged before touching either file.

**Resolution (explicit sign-off received this session):** bare `/` now
redirects to `/{locale}` — the landing page — instead of
`/{locale}/chat`. This is the intended behavior: the landing page is
meant to be the first-touch surface for a logged-out visitor, and all of
this phase's work (hero, table, calculator, etc.) would otherwise be
unreachable dead code sitting behind a route nothing ever links to.

**Diff, scoped to exactly one line + comment:**
`middleware.ts`: `pathname === "/" ? \`/${locale}/chat\` : ...` →
`pathname === "/" ? \`/${locale}\` : ...`. Every other line (locale
detection, `x-next-intl-locale` / `x-pathname` header forwarding, the
route matcher) is byte-identical to before.

`middleware.test.ts`: only the two bare-`/` assertions changed
(expected redirect target `/ar` and `/en` instead of `/ar/chat` and
`/en/chat`). The other five tests in the file (locale-prefixed path
header forwarding, the `//evil.com` client-header-spoofing guard, the
`/api` skip) are untouched and still exercise unrelated, still-correct
behavior.

`e2e/landing.spec.ts` was NOT broken by this change — it already
navigated straight to `page.goto("/en")`, never to `/`, so the routing
change doesn't affect it. Its own doc comment was updated to note (a)
the ModelGrid/PackageGrid → ModelsSection/PackagesSection rename, (b)
that the routing change doesn't touch this spec, and (c) a new
ambiguity: the models table can now also render the string "YER" per
row (`table.priceYerPerK`), so the existing `text=YER` locator used to
detect "some package exists" is looser than it used to be — still
correct for what it currently asserts, flagged for whoever revisits it
next.

### Not done / not verified this round

- **No `tsc`, vitest, `next build`, or Playwright run at all.** Nothing
  in this phase's file set (new or edited) has been compiled or
  executed. In particular: `index.tsx`'s prop shapes against the real
  `LandingData`/`getLandingData` return type, whether `useTranslations`
  keys with nested template interpolation (`{value}`, `{count}`,
  `{price}` etc.) resolve correctly against next-intl's ICU parsing, and
  whether `framer-motion`'s `motion[as]` dynamic-tag pattern in
  `reveal.tsx` type-checks under this repo's strict flags.
- **No tests written** for any component added this round (only the
  pure `lib/`/`config/` modules that shipped with their own `.test.ts`
  files already have coverage).
- **LiveBench iframe embedding is unverified** — whether livebench.ai
  sends `X-Frame-Options`/`frame-ancestors` that would blank the iframe
  is not checkable without a real browser hitting the real site; the
  "Open on livebench.ai" link is always visible specifically because of
  this.
- **Old `models.*` namespace keys** (`noneAvailable`, `contextWindow`,
  `priceInput`, `priceOutput`, `premium`, `standard`, `perThousand`) used
  only by the now-deleted `model-grid.tsx` were left in place, not
  pruned — worth checking whether anything else still reads them before
  removing as dead keys.
- **CSP / `frame-src`**: confirmed no Content-Security-Policy exists
  anywhere in this repo (checked `next.config.*` and `middleware.ts`),
  so there is currently nothing to add a `livebench.ai` allowance to. If
  a CSP is introduced later, this needs revisiting.

---

## B1 — Chat contract (backend track, §7) — lands on `main`, not `frontend-v2`

Per plan rule L3, this is a backend PR to `main` (additive only), separate
from the `frontend-v2` UI work everything else in this file tracks. Noted
here anyway since §7 says every B session updates this file.

### What shipped
- `apps/api/src/schemas/chat.schema.ts` (new) — Zod validation for
  `POST /chat`'s body, replacing the bare `as` cast (F2). Every field
  beyond the original `{model, messages, conversationId}` trio
  (`temperature`, `top_p`, `max_tokens`, `systemPrompt`,
  `clientMessageId`, `regenerate`) is optional.
- `apps/api/src/services/chat-idempotency.service.ts` (new) — Redis
  `SET NX EX` claim for `(conversationId, clientMessageId)`, 24h TTL,
  fails open on Redis error (same posture as `fraud.service.ts`'s
  `fraudRedis`).
- `apps/api/src/services/gateway.service.ts` (edited) — `streamChat` now:
  forwards `temperature`/`top_p` as-is and `max_tokens` clamped to the
  resolved model's own `maxOutputTokens`; prepends `systemPrompt` as a
  leading system message to the gateway request and persists it on the
  conversation's *initial* insert only (`onConflictDoNothing` means a
  later `PATCH` is still the source of truth for changing it after
  creation); skips the user-row insert unconditionally when
  `regenerate` is true, or claims `clientMessageId` via
  `chat-idempotency.service` first when present (F4); binds the upstream
  `fetch` to an `abortSignal` combined with the existing 120s timeout via
  a hand-rolled `combineAbortSignals` (F5).
- `apps/api/src/index.ts` (edited) — parses the body with
  `chatRequestSchema` (400 + Arabic message + English `details` on
  failure), creates an `AbortController` bound to `reply.raw`'s `"close"`
  event and passes its signal into `streamChat`, forwards all new
  optional fields through.
- `apps/api/src/test/fakeRedis.ts` (edited, additive) — added
  `set(key, value, "EX", seconds, "NX")` with real NX semantics (TTL
  accepted, not enforced — same posture as the existing `expire` no-op).
  Throws on any other flag combination instead of silently misbehaving.
- `apps/web/app/api/conversations/[id]/route.ts` (edited, sanctioned
  frozen-zone touch per plan §4: backend changes to `app/api/**` happen
  only in §7 sessions) — `PATCH` now accepts an optional `systemPrompt`
  string; empty string clears it, `undefined` (field omitted) leaves it
  untouched, matching the existing `title`/`isPinned` pattern.
- Tests: `chat.schema.test.ts` (new — schema shape, edge cases, and a
  100-random-malformed-body loop that only asserts non-throwing, since
  Zod's `safeParse` never throws by design — the actual "don't hit the
  DB on garbage" property lives in `redeemCode`'s checksum pre-check, not
  here), `chat-idempotency.service.test.ts` (new — claim/duplicate/
  cross-conversation/fail-open), and 9 new cases appended to
  `gateway.service.test.ts` (param forwarding + clamping, systemPrompt
  forwarding + persistence, regenerate skip, idempotent claim + duplicate
  skip, client-disconnect abort with no reply sent, timeout still 504s
  when only the safety timer fires).

### Deviations from the plan text (flagged, not asked)
- **No DB migration.** Idempotency uses Redis, not a `clientMessageId`
  column — sidesteps a real migration-numbering collision with B2 (§7),
  which explicitly claims migration `0009`; if B1 also needed one it
  would have to take `0009` first (B1 lands before B2), silently
  breaking B2's plan text. Matches this repo's existing style (fraud/
  rate-limit state is Redis-based, not DB-based).
- **Tracker-order note carried over from the Phase Summary:** the
  tracker (§5) lists B1 immediately after `3.2`; §6's own B1 header says
  "Do 4a and 4b first; B1 must land before 4c." These disagree with each
  other on sequencing. Checked: `3.2`/`4a`/`4b` are not a *functional*
  prerequisite for B1 (B1 touches only `apps/api` +
  `apps/web/app/api/conversations/[id]`, nothing landing/legal/
  message-rendering related), and no frontend code in this repo calls
  `POST /api/chat` yet (Phase 4 chat UI hasn't been built), so "must not
  break the legacy UI" is satisfied trivially for this endpoint. B1
  proceeded on that reading.

### Verification
- `pnpm --filter @ai-platform/api test` — full suite must stay green
  (regression + the new files above). This is the existing `api-tests`
  CI job; no new job needed, B1 added test files, not a new test target.
- Manual, once deployed to Render:
  - `curl -X POST $API/chat -H "Authorization: ..." -d '{"model":123}'`
    → expect `400 VALIDATION_ERROR`.
  - Same conversation, two calls with an identical `clientMessageId` →
    expect exactly one `messages` row with `role='user'` for that turn.
  - Start a chat, abort the client request mid-stream (e.g. `curl
    --max-time 1`) → expect the request logged as interrupted rather than
    running to completion server-side (cannot confirm from this repo
    alone whether the *New API* Go binary itself stops billing/
    generating — see below).
- `web-build` (existing job): unaffected — `gateway.service.ts` isn't
  reachable from `appRouter`'s import graph, and the one `apps/web`
  file touched (`conversations/[id]/route.ts`) only gained an additional
  optional field on an existing, already-typed request body.

### What breaks in production if this is wrong
- If `claimUserMessage` didn't fail open, a Redis outage would silently
  drop real user turns (no user-row insert, no error surfaced) — covered
  by `chat-idempotency.service.test.ts`'s fail-open case.
- If `combineAbortSignals` didn't actually propagate, Stop/tab-close
  would keep paying the upstream provider for the full generation
  (pre-B1 bug, F5) — covered by the new "stops silently on client
  disconnect" test in `gateway.service.test.ts`.
- If `max_tokens` clamping were skipped, a malicious/buggy client could
  request more output than a model allows, wasting spend before the
  provider itself rejects it — covered by the "clamped to the model's
  ceiling" test.
- If any new field were accidentally required instead of optional, every
  existing raw-API-key caller (F17) would start getting 400s on a
  previously-working integration — covered by
  `chat.schema.test.ts`'s "accepts every new field omitted" case.

### Gate check
- Phase 0.1 (legal docs): done (see this file's earlier D1/0.2 entries).
- No other `main`-track prerequisite phase exists for B1 to depend on —
  it's the first backend-track (§7) session.

### Not verifiable without running code
- Whether aborting our fetch to the New API gateway makes **New API
  itself** stop billing/generating upstream, vs. just closing our leg of
  the HTTP connection — that logic is inside the Go binary, outside this
  repo, and nothing here can confirm it either way. The abort DOES stop
  us from continuing to read/relay/bill for tokens on our side either
  way, which is the part actually in scope for F5.
- Whether this CI runner's Node version supports `AbortSignal.any()`
  (Node 20.3+) — sidestepped by hand-rolling `combineAbortSignals`
  instead of depending on it, so this no longer blocks anything, but the
  repo's actual Node version in CI was never confirmed.
- Actual `tsc`/`eslint`/`vitest`/`next build` execution for any file in
  this session — reasoned through against the existing code and test
  patterns in this repo, not run (no network, Postgres, or Redis in this
  sandbox).

### Not done this round
- B2 (user usage + `idx_transactions_type_date` migration), B3 (admin
  logs/audit), B4 (Turnstile on manual payments + real `/api/status`) —
  all still open, per §7.

## B1 hotfix — `exactOptionalPropertyTypes` build break (post-deploy)

The first B1 zip failed Vercel's build: `tsc --noEmit` on `apps/api` threw
`TS2379` on `temperature` at `src/index.ts:119`. Root cause: the repo's
`tsconfig.base.json` has `"exactOptionalPropertyTypes": true`, which treats
`foo?: number` (key may be absent) and `foo: number | undefined` (key may be
present but `undefined`) as genuinely different types. `chatRequestSchema`'s
Zod `.optional()` fields infer as the latter, and `index.ts` passes them
straight into `StreamChatOptions`, which was declared as the former for six
fields (`temperature`, `top_p`, `max_tokens`, `systemPrompt`,
`clientMessageId`, `regenerate`) — a mismatch under that flag. The CI log
only named `temperature` because `tsc` stops at the first bad property in
an object literal; the other five would have failed the same way one CI run
at a time if only `temperature` had been patched.

**Fix:** widened all six `StreamChatOptions` fields in
`apps/api/src/services/gateway.service.ts` to `T | undefined`. Type-only
change, no runtime behavior differs.

**Checked and confirmed unaffected (no fix needed):**
`gateway.service.test.ts` (never explicitly assigns `undefined` to these
fields), `chat-idempotency.service.ts`/`.test.ts`, `test/fakeRedis.ts`, and
`apps/web/app/api/conversations/[id]/route.ts` (uses guarded
`if (x !== undefined)` assignment, already safe under this flag).

**Not verifiable without running code (same caveat as the original B1
entry, still true here):** no `node_modules`/network in this sandbox, so
this was a manual read of `exactOptionalPropertyTypes` semantics against
the exact reported error, not a confirmed green `tsc --noEmit`. I grepped
every other B1-touched file for the same "object literal into optional
property" pattern to rule out sibling failures, but only a real local
`tsc` run can fully confirm there isn't an unrelated occurrence elsewhere
in the codebase.

## Hotfix #2 — `0003_payment_methods.sql` seed overflow (post-deploy)

Next CI run got further (type-check/lint, API tests, web build/unit tests,
i18n, legal-docs-sync all green) and failed in E2E's "Apply raw SQL
migrations" step instead:
`psql:...0003_payment_methods.sql:152: ERROR: integer out of range`.

**Root cause:** `packages.credits` is `bigint`, but the four seed `INSERT`s
write it as a bare `N * 1000000` literal expression. Postgres evaluates
literal `int * int` multiplication as 32-bit (`int4`) arithmetic *before*
casting into the bigint column — the column's type doesn't retroactively
widen the literal expression. `int4` maxes at 2,147,483,647; three of the
four seed rows (300/850/1800 × 1,000,000, up to 1.8B) fit and inserted
silently, but the fourth (3,800 × 1,000,000 = 3,800,000,000) overflowed —
which is why only that one `INSERT` failed and the error line pointed at
the last statement in the file.

**Fix:** cast the credit-count operand to `::bigint` on all four seed rows
(not just the one that overflowed, to stop this from silently resurfacing
the next time a larger package is added to this same seed block).

**Not verifiable without running code:** no Postgres/network in this
sandbox — this is a read of Postgres's literal-folding behavior against
the exact error, not a re-run migration. The steps after "Apply raw SQL
migrations" (seed users/models, web build, Playwright itself) never ran in
either failed CI attempt so far — this fix only addresses the first
blocker reached, not a confirmed pass of the full E2E job.

## Phase 4a — Chat message rendering

**Built:** `components/markdown/{safe-markdown,code-block}.tsx` (the
untrusted-model-output renderer: no rehype-raw, remote images blocked,
links forced `rel=noopener noreferrer`, fenced code delegated to
CodeBlock with a language label + copy button, inline code styled
separately — react-markdown v9's `code` override distinguishes the two
by presence of a rehype-highlight `className`, since the old `inline`
prop was removed in v9); `features/chat/types.ts` (reconciles the deleted
placeholder `ChatMessage` against the real `@ai-platform/db` `messages`
row — see that file's header for why gateway errors are modeled as a
separate, non-persisted `ChatError` rather than a flag on `ChatMessage`);
`features/chat/components/message/{message,message-actions,message-list,
error-message}.tsx` (real, i18n'd replacements for the deleted
`components/chat/{message-bubble,message-actions}.tsx`); `content/demo/
chat-render-fixture.ts` + `/dev/chat-render` (Arabic+code fixture, partial
turn, error turn, and the three XSS payloads, gated the same way
`/dev/kitchen-sink` is); `styles/code-highlight.css` (hand-written 3-tone
`.hljs-*` token colors — no highlight.js theme package imported, see
below); `components/markdown/safe-markdown.test.tsx` (XSS fixtures +
trusted-rendering sanity checks, rendered via `react-dom/server`'s
`renderToStaticMarkup`, no jsdom).

**Deleted:** `components/chat/{message-bubble,message-actions}.tsx` —
presentational pre-phase scaffolding, superseded by the `features/chat`
files above. Their one consumer, `/dev/kitchen-sink`'s
`kitchen-sink-client.tsx`, was updated to import the real components and
adapted `DEMO_MESSAGES`/added `DEMO_ERROR` to the new `ChatMessage`/
`ChatError` shapes. `components/chat/{composer,chat-sidebar}.tsx` are
untouched — still presentational, still 4c/4d's scope.

**Config changes (both justified by the same lockfile constraint as B1
hotfix #1 — no network/node_modules here to run `pnpm add` and regen
`pnpm-lock.yaml`, and every CI job runs `pnpm install --frozen-lockfile`):**
- `vitest.config.ts` gained a `resolve.alias` for `@/*` — this is 4a's
  first test that actually renders a component tree (every test before
  this was pure logic, see that file's own header comment), and nothing
  before now needed Vite to resolve the alias Next.js's own bundler
  already handles. No new dependency, config only.
- `.eslintrc.json`'s physical-direction-class override gained
  `**/dev/chat-render/**`, matching the existing `**/dev/kitchen-sink/**`
  entry (same category of internal QA tooling).
- `messages/{ar,en}.json` gained two new `chat.*` keys (`loadEarlier`,
  `remoteImageBlocked`) — parity checked, both files updated identically.

**Deviations from FRONTEND_REBUILD_PLAN.md's Phase 4a spec (flagged
before building, approved):**
- **No shiki** — `rehype-highlight` (already a dependency) used instead.
  Adding `shiki` would need the same lockfile regen the config changes
  above avoided by not being a new dependency at all.
- **D5 (AI Elements spike): skipped**, not attempted — same blocker
  (installing packages to test compatibility needs a working `pnpm add`).
  Went straight to the plan's own stated fallback: own components.
- **No `@testing-library/react`/jsdom** — `react-dom/server`'s
  `renderToStaticMarkup` used instead (see vitest.config.ts's comment
  above and safe-markdown.test.tsx's own header).
- **`streaming-cursor.tsx`: not built.** Originally planned as a
  visual-only blinking cursor; dropped at the person's explicit
  instruction before building — 4b will render streaming text however it
  actually streams, with no separate cursor component needed.

**Not verifiable without running code:** no `node_modules`/network here,
so nothing in this phase was actually built or test-run. Specific risks,
ranked by how likely they are to surface something on the first real CI
run:
1. `components/markdown/safe-markdown.test.tsx` is the highest-risk file
   in this phase — it's the first test in the repo to render a real
   React component tree, and depends on three things I could not verify
   against the installed versions: (a) `next-intl`'s
   `NextIntlClientProvider` working standalone under plain
   `react-dom/server` outside a Next.js runtime; (b) react-markdown v9's
   documented default URL-sanitization behavior (blocking `javascript:`
   hrefs) being unchanged from what its README describes — this
   component does not implement its own scheme-checking, it relies on
   that default; (c) the `components` prop's exact override function
   signatures typechecking under react-markdown v9's actual exported
   types (written with contextual/inline typing rather than importing
   react-markdown's `Components` type by name, specifically to reduce
   this risk, but contextual inference isn't a substitute for `tsc`
   actually running).
2. `code-block.tsx`'s `getNodeText` tree-walk (for the copy button's
   clipboard text) assumes rehype-highlight's hast→React output is
   always strings/numbers/elements with a `children` prop — true for
   every hljs token span I'm aware of, not independently confirmed
   against the installed `rehype-highlight`/`lowlight` version.
3. Everything else (the `.tsx` component structure, i18n key usage,
   Tailwind logical-property classes, the `exactOptionalPropertyTypes`
   discipline learned from B1 hotfix #1) follows patterns already proven
   elsewhere in this codebase and carries substantially lower risk than
   points 1–2 above.

## Phase 4a — CI green-up (post-build fixes, closing the phase)

First real CI run on `frontend-v2` (screenshots reviewed, not re-run
here — same no-network-sandbox caveat as everywhere above) came back
5 green / 2 red: `web-unit` and `E2E (Playwright)`. Both root-caused
from the log text alone; both are test-only fixes, no app code touched.

**`web-unit` — `ReferenceError: React is not defined` (7/7 tests in
`safe-markdown.test.tsx`):** `tsconfig.json` sets `"jsx": "preserve"`
because in a normal Next.js build it's Next's own compiler that lowers
JSX, using the automatic runtime (no `React` identifier needed in
scope — this is why the test file never imported React just to write
JSX). Vitest doesn't go through Next's compiler; it transforms `.tsx`
via esbuild directly, which defaults to the classic runtime
(`React.createElement`, requiring `React` in scope) unless told
otherwise. **Fix:** `vitest.config.ts` gained `esbuild: { jsx:
"automatic" }`. No new dependency (React 19 already ships
`react/jsx-runtime`), no lockfile change.

**`E2E (Playwright)` — "legal footer links navigate to the correct
documents" timing out, log shows the click retrying against a `Cookie
notice` region that "subtree intercepts pointer events":**
`features/consent/components/consent-banner.tsx` renders `fixed
inset-x-0 bottom-0` once mounted, directly over `landing-footer.tsx`'s
region (also bottom-of-page) whenever `op.consent.dismissedAt` isn't
yet in `localStorage` — true on every fresh CI browser context. This
was a genuine obstruction, not flakiness: the footer link really was
covered. **Fix:** `e2e/landing.spec.ts` gained a `test.beforeEach` that
`page.addInitScript`s the same `op.consent.dismissedAt` key
`dismissConsent()` writes, before any page script runs — mimics a
returning visitor who already dismissed the banner, so it never mounts.
Applied to the whole `describe` block (not just the failing test) since
it's a correct precondition for all three landing tests, not a
workaround for one.

**Not verifiable without running code:** same sandbox constraint as
every other entry in this file — neither fix was run against a live
`vitest`/`playwright`. The vitest fix is a one-line, well-documented
esbuild option with no ambiguity in its semantics, so residual risk is
low. The e2e fix depends on `ConsentBanner`'s `mounted`-guard `useEffect`
actually re-reading `localStorage` (via `isConsentDismissed()`) on the
client before first paint in a Playwright-driven Chromium the same way
it does in a real browser — plausible from the code, not independently
confirmed here.

**Verification (next CI run on `frontend-v2`):**
- `web-unit` job: all 18 test files / 366+7=373 tests pass (was 359
  passed, 7 failed).
- `E2E (Playwright)` job: `landing.spec.ts`'s 3 tests all pass (was 2
  passed, 1 failed — the other two landing tests were unaffected by the
  banner since they don't scroll to/click the footer).
- If green: Phase 4a closes — all 7 `deploy.yml` jobs green, tracker
  §5 ticked, matching plan rule 0.4's phase-done definition.

## Phase 4a — CI green-up round 2 (from actual failing-job logs)

The round-1 fixes above landed and the `React is not defined` /
consent-banner-overlap failures are gone. Re-run came back 6 green / 2
red — `web-unit` and `E2E (Playwright)` again, but different failures
this time, root-caused directly from the real GitHub Actions log text
(screenshots), not speculation. Both are test-only fixes again; no app
code touched.

**`web-unit` — `safe-markdown.test.tsx`, 2 of 7 assertions failing:**
1. The `<div onclick>` XSS test's own regex, `/<div[\s>]/`, is too
   broad: `SafeMarkdown` always wraps its output in its own legitimate
   `<div class="text-[15px] leading-[1.65] ...">` (see
   `safe-markdown.tsx`), which the regex matches regardless of whether
   the payload itself became real markup. The log confirms the payload
   *was* correctly escaped (`&lt;div onclick=...&gt;`) — this was a
   test false-positive, not an XSS regression. **Fix:** narrowed to
   `/<div\s+onclick=/i`, which targets the payload's own attribute and
   ignores the always-present wrapper.
2. The code-highlighting sanity check asserted `toContain("def f():")`
   against raw HTML, but `rehype-highlight` tokenizes it into
   `<span class="hljs-keyword">def</span> <span class="hljs-title
   function_">f</span>():` — correct, intended output — so the literal
   substring no longer exists in the markup even though it's exactly
   what a reader sees. **Fix:** strip tags (`html.replace(/<[^>]+>/g,
   "")`) before this one assertion; the other two assertions in that
   test (Arabic prose, `dir="ltr"`) are unaffected and still assert on
   raw HTML.

**`E2E (Playwright)` — `landing.spec.ts`, 2 of 3 tests failing, both
strict-mode violations (`getByRole`/`getByText` resolving to 2
elements), not timeouts:**
1. `"renders live model data from the database"` — unscoped
   `page.getByText("GPT-4o", { exact: true })` also matches
   `features/landing/components/cost-ranking.tsx`'s own model-name span
   (the "Cost, ranked" calculator independently lists every model,
   including GPT-4o, elsewhere on the same landing page — correct
   content, not a duplicate bug). **Fix:** scoped to
   `page.locator("#models").getByText("GPT-4o", { exact: true })`,
   `#models` being `models-section.tsx`'s own section id.
2. `"legal footer links navigate to the correct documents"` — unscoped
   `page.getByRole("heading", { name: "Terms of Service" })` substring-
   matches both the page chrome's own `<h1>Terms of Service</h1>`
   (`legal/[doc]/page.tsx`) and the TOS markdown's own first heading,
   `"Terms of Service — AI Platform / منصة الذكاء الاصطناعي"`
   (`docs/legal/TERMS_OF_SERVICE.md`'s first line, rendered by
   `LegalDocView`) — both headings are correct, intended content.
   **Fix:** added `exact: true` so the assertion only targets the page
   chrome's own heading.

**Not verifiable without running code:** same sandbox constraint as
every other entry in this file. Unlike round 1, though, both e2e root
causes here were read directly off the Playwright "strict mode
violation" error text (which lists every matching element verbatim),
not inferred — residual risk is limited to whether `#models` still
wraps only the models table and nothing else that also contains
"GPT-4o" verbatim, which the codebase confirms as of this write.

**Verification (next CI run):**
- `web-unit` job: `safe-markdown.test.tsx`'s remaining 2 assertions
  pass (was 5/7 passing, 2 failing).
- `E2E (Playwright)` job: `landing.spec.ts`'s 3 tests all pass with no
  retries needed (was 1/3 passing outright, 2 needing/failing retries).
- If green: Phase 4a closes — all 7 `deploy.yml` jobs green, tracker
  §5 ticked, matching plan rule 0.4's phase-done definition.

----


## Phase 4b — Chat: streaming + state

### What landed
`features/chat/lib/chat-stream-reducer.ts` (pure reducer, D3: custom, not
AI SDK `useChat`), `features/chat/lib/stream-reader.ts` (the `fetch` +
`getReader()` + `TextDecoder({stream:true})` loop, kept separate from the
reducer so it's testable without React), `features/chat/hooks/
use-chat-stream.ts` (AbortController + send-lock + wiring), `features/chat/
hooks/{use-online-status,use-tab-conflict}.ts` + `features/chat/components/
{offline-banner,tab-conflict-banner}.tsx`. No frozen-zone edits — `app/api/
chat/route.ts` reused as-is.

### Bug found in the drafted files, fixed before landing
Both new test files were named with an underscore
(`chat-stream-reducer_test.ts`, `stream-reader_test.ts`) instead of
`.test.ts`. `vitest.config.ts`'s `include` is `["**/*.test.ts",
"**/*.test.tsx"]` — this is the exact bug Session 2.2 already hit once
(`trpc-error_test.ts`). As drafted, both files would have silently never
run in CI: green `web-unit`, zero coverage of the split-character/stop/
retry/partial cases the plan requires. Renamed both; contents otherwise
unchanged except the one addition below.

### Second bug found and fixed: `redirectTo` was dropped on 401 mid-stream
`stream-reader.ts` already maps a 401 to `onError({ retryable: false,
redirectTo: "/auth/login" })`, and `use-chat-stream.ts`'s own header
comment says "the caller reads `error`/`redirectTo` off a rejected send" —
but `ChatError` (features/chat/types.ts, from 4a) has no `redirectTo`
field, and the hook's `onError` callback only forwarded `id`/`message`/
`retryable` into the dispatched action, silently discarding the value the
comment promised existed. Fixed:
- `types.ts`: added `redirectTo?: string | undefined` to `ChatError`
  (additive/optional — 4a's `ErrorMessage` component doesn't read it and
  is unaffected).
- `use-chat-stream.ts`: `onError` now forwards `error.redirectTo` into the
  dispatched `ChatError`.
- `chat-stream-reducer.ts` needed no change — its `ERROR` case already
  stores `action.error` whole, so once the field exists on the type it
  flows through untouched.
- New reducer test: `"passes redirectTo through untouched (401 mid-stream
  case)"` — regression guard for this specific wiring, not just the type
  existing.

The redirect itself is still not performed anywhere in this phase — no
router access belongs in this hook by design, and there's no page wiring
`useChatStream` yet (that's a later phase). This fix makes the value
reach a future caller intact; it doesn't add the caller.

### Verification
- `pnpm --filter apps/web test` (the `web-unit` job): the two renamed
  test files should now collect and run — confirm they show up in the
  test list, not just that the job is green (a naming regression like
  this one is invisible in a pass/fail summary alone).
- Preview: send → stream tokens in → done; Stop mid-stream → cursor
  stops, no further text; retry after an error; DevTools offline →
  `OfflineBanner` appears/disappears; same conversation in two tabs →
  `TabConflictBanner` appears, updates when the other tab starts/stops
  sending.
- `/admin/logs`: exactly one `usage_debit` transaction per completed
  stream — backend guarantee (B1's `deductCreditsAtomic`), this phase's
  job is only to confirm the client never fires a second `POST /api/chat`
  for one send (send-lock tests cover the client side of that).
- No other CI job (`api-tests`, `e2e`, `i18n-parity`, `legal-docs-sync`)
  should be affected — no i18n keys added (all three used were already
  present), no `app/api/**`/`server/**` file touched.

### Refined finding on client-abort → server-abort propagation
Read `app/api/chat/route.ts` directly rather than re-flagging this as a
blanket unknown. The route's own outbound `fetch` to `apps/api` is bound
only to `AbortSignal.timeout(125_000)` — it does **not** read the
incoming `NextRequest`'s own signal and tie it to that outbound fetch.
So: client `Stop` → `AbortController.abort()` closes the browser's
connection to this Next route, but whether that actually terminates the
Node/Vercel function (and therefore its in-flight fetch to `apps/api`,
which is what would let B1's `reply.raw "close"` handler on the Fastify
side fire) depends on Vercel/Node serverless runtime behavior, not on
anything in this repo. This is still not verifiable from the codebase
alone — flagging as a confirmed *gap in the route's own code* (not just
"unverified platform behavior") for whoever next touches `app/api/chat/
route.ts` in a `§7` session.

### Not verified (no node_modules/network in this sandbox — standing gap)
- No real `tsc`, `next build`, or `vitest` run. In particular:
  `ChatMessage`/`ChatError` prop typing between `chat-stream-reducer.ts`,
  `use-chat-stream.ts`, and 4a's `MessageList`/`ErrorMessage` — checked by
  reading the files side by side (fields line up), not by compiling them
  together.
- `use-tab-conflict.ts`'s `BroadcastChannel` behavior across two real
  browser tabs — code-reviewed only.
- Whether the strict tsconfig flags that broke earlier phases
  (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) affect
  anything new here — the new optional fields
  (`ChatError.redirectTo?: string | undefined`,
  `StreamCallbacks.onError`'s `redirectTo?`) were written in the explicit
  `T | undefined` form those earlier fixes established as the safe
  pattern, but this has not been confirmed by a real compile.

### Third fix — from the full CI log (round 2, `Type-check & Lint` job)
The full log (not just the Vercel `next build` excerpt, which only shows
the first error `tsc` hits) showed a *second*, distinct error at
`stream-reader.test.ts(25,7)`, TS2322: `fakeReader`'s inner `read` async
function's inferred return type didn't match its own declared return
type. Root cause: `noUncheckedIndexedAccess` (confirmed on in this
repo's tsconfig by three earlier sessions' build fixes, most recently
3.1 round 2's `register/page.tsx` fix) types `chunks[i]` as `Uint8Array |
undefined`, not `Uint8Array` — even though the `i >= chunks.length`
guard immediately above already proves it's defined at that point. That
`undefined` leaked into the `{ done: false, value }` return, which is
what actually produced the confusing `Promise<{done:true;value?:never}>
| {done:false;value:Uint8Array|undefined}` type in the error text (not a
separate bug in `stream-reader.ts` itself, as first suspected — a single
root cause in the test file, cascading into a second annotation).

Fix: `const value = chunks[i]!;` — the non-null assertion is justified
specifically by the bounds check two lines above, same pattern as the
`register/page.tsx` fix. The third GitHub annotation (`command
(/home/runner/.../apps/web) ...exited (2)`) was, as suspected, just the
step-level wrapper for the same underlying `tsc` failure, not a third
distinct error — confirmed by the full log, not guessed.

Second `redirectTo` widening (`StreamCallbacks.onError` in
`stream-reader.ts`, applied the same round) still stands as a real,
separate fix — the full log shows both TS2322 (this one) and TS2379 (the
`redirectTo` one) as genuinely two different diagnostics in the same
file, not one cascading into the other.

**Not verifiable without running code:** same standing sandbox gap — this
fix is read directly off the full `tsc` output this time (not inferred
from a truncated annotation), which is higher-confidence than the first
round, but still not a confirmed green `tsc --noEmit` run.


### Not done this round
4c (input/models/parameters) was open at the time of writing; it is built
in the next section. 4d (conversations + cache) remained open.


---

## Phase 4c — Chat: input, models, parameters

### Decision record — where the parameters persist (read first)
The plan's 4c "Done when" says parameters "persist per conversation", but
B1's own spec only persists `systemPrompt` (plan §7), and the frozen code
agrees: `conversations` has no columns for `temperature` / `top_p` /
`max_tokens`, and `PATCH /api/conversations/[id]` doesn't accept them.
Chosen: **frontend-only, no frozen-zone edits.**

| Param | Persists | Where | Cross-device |
|---|---|---|---|
| `systemPrompt` | yes | server, via the existing B1 PATCH | yes |
| `temperature`, `top_p`, `max_tokens` | yes | `localStorage`, per conversation id | **no — this browser only** |
| last-picked model | yes | `localStorage` | no |

Reasoning: the frozen-zone rule is a standing instruction, and the upgrade
path is small and isolated — three nullable columns on `conversations`
(hand-written migration in the `0006_model_latency.sql` style), extend the
PATCH body, capture them at first insert in `gateway.service.ts`. A future
**backend** session, not a frontend one. Nothing built here blocks it;
`lib/chat-params-storage.ts` would become a thin offline fallback.

An earlier draft of this phase (from a prior session) had applied exactly
those frozen-zone edits (schema, migration `0009`, PATCH route,
`gateway.service.ts`). That work did not exist in the repo zip this session
was given, so it was **not carried forward**; migration number `0009` is
also already claimed by B2 (plan §7, `idx_transactions_type_date`), so a
params migration would have needed `0010` regardless.

### What was built (all under `apps/web`, nothing frozen touched)
- `components/chat/composer.tsx` — **modified.** Fixes two real bugs in the
  restyle-session version: (1) Enter sent unconditionally, so an Arabic/CJK
  IME candidate-confirm Enter submitted half-typed text — now guarded by
  `isComposing` **and** Safari's `keyCode === 229` (Safari fires
  `compositionend` before the final keydown, so `isComposing` alone
  misfires there); (2) `aria-label="إرسال"` was hardcoded Arabic — now
  `chat.send`. Added auto-resize (`useLayoutEffect`, resets to `auto`
  first so it can shrink) and an optional `sendBlockedReason`
  (`aria-invalid` + `aria-describedby` + `role="alert"`; distinct from
  `disabled`, which would also stop the user editing an over-long draft
  down). All new props optional → `dev/kitchen-sink` unchanged.
- `features/chat/lib/` (all pure, all unit-tested): `composer-keydown`,
  `context-estimate`, `model-selection`, `chat-params-storage`,
  `param-input`, `conversation-api`.
- `features/chat/hooks/`: `use-chat-models` (tRPC `models.list`),
  `use-chat-params` (params + system-prompt load/debounced-PATCH).
  `use-chat-stream` **modified** to carry the four params.
- `features/chat/components/composer/`: `model-picker`, `parameters-panel`,
  `composer-bar` (assembly).
- `lib/stream-reader.ts` **modified:** request body gains four optional
  fields. `types.ts` **modified:** `ConversationParams`.
- `messages/{ar,en}.json`: new `chat.parameters.*` block (additive; the
  only removed line per file is a trailing-comma change on the previous
  last key). ar/en key parity confirmed.
- `app/[locale]/dev/chat-composer/` — fixture harness (see "How to verify").
- `docs/frontend/API_CONTRACT.md` — **corrected**, see below.

### Integration boundary — 4c does NOT mount these in `/chat`
`app/[locale]/(app)/chat/page.tsx` is still the Phase 2.1 placeholder and
the plan assigns `/chat` + `/chat/[id]` to **4d**. Nothing outside
`features/chat` and the `/dev` page imports `ComposerBar` or
`useChatStream` yet. Mounting them needs conversation creation, the
sidebar and the cache — all 4d. **4d must:** create the conversation
(`POST /api/conversations`) before the first send, pass
`params`/`systemPrompt` from `useChatParams` into `useChatStream`, pass
`conversationExists` (true once the row exists) to `useChatParams`, and
feed `history` (prior turns) into `ComposerBar` so the token estimate
covers the whole request.

### Bugs found and fixed in my own first draft
1. **Picker unresponsive on an existing conversation.** Priority was
   conversation model > last-picked, so clicking another model updated
   `localStorage` but the picker kept showing the conversation's model.
   Added a "picked this session" tier above both; tested.
2. **Pending system-prompt PATCH dropped on conversation switch/unmount.**
   Now flushed against the id it was made for, not silently discarded.
3. **`exactOptionalPropertyTypes` leaks.** Optional request fields are
   *omitted* (conditional spread off plain local consts), never `undefined`
   and never `null` — the server's Zod schema is `.optional()`, so a
   literal `null` on the wire is a 400.
4. **A regex "test" that couldn't fail:** a mutation test showed my first
   `join(" ")` mutation survived because it matched the *comment*, not the
   code. Re-ran against the real line; now caught.

### API_CONTRACT.md was stale since B1 — corrected
§3 and quirk #10 still said `/chat` had zero validation, no
`clientMessageId`, and no abort handling. All false since B1. Verified
against `chat.schema.ts` / `gateway.service.ts` and rewrote: request shape
(all-optional fields, `null` rejected), F4 fixed (idempotency claim is on
the `(conversationId, clientMessageId)` pair), F5 fixed (abort bound to
disconnect), context estimate formula, system-prompt "first write wins".
Added quirks 11–13 (price units, list endpoint omits `systemPrompt`,
PATCH succeeds on 0 rows). **Anyone who built from the old doc should
re-read §3.**

### How to verify
**CI:** `web-unit` (new tests: `composer-keydown`, `context-estimate`,
`model-selection`, `chat-params-storage`, `param-input`,
`conversation-api`), `Type-check & Lint`, `web-build`, `i18n-parity`.

**Preview** — open `/ar/dev/chat-composer` and `/en/dev/chat-composer`:
1. Select **"Tiny context"**, paste ~800 characters → Send disables, red
   border, localized warning appears; delete text → re-enables.
2. Type ~600 characters (≈80% of the limit) → amber "approaching limit".
3. Shift+Enter inserts a newline; Enter sends. Textarea grows, then
   scrolls past 180px.
4. **IME (needs a real device):** with an Arabic phonetic IME, press Enter
   to accept a candidate → nothing is sent. Repeat on Safari/iOS.
5. Open Parameters: temperature `3` → inline range error and the "Would
   be sent" JSON does **not** change; `٠٫٧` (Arabic digits) → accepted as
   0.7; empty → key absent from the JSON (not `null`).
6. "Tiny context" shows `—` for latency; "Large model" shows `1.2s`.
7. Both themes, both directions. Prices show Western digits in `ar`.
8. **Sign-out (Rule 9, real app only):** pick a model → sign out → sign in
   as a different user → last-picked model is **not** carried over.
   *(Cannot be exercised on the harness page — no auth there.)*

**Not exercisable until 4d mounts the real route:** "parameters change the
response", system-prompt PATCH round-trip, reload persistence of a real
conversation's params. The plan's "Done when" for 4c is therefore only
**partially** demonstrable now; the rest is a 4d acceptance check.

### Not verified (no `tsc`/`next build`/browser/network in this sandbox)
- **No real `tsc`, `next build`, or `vitest` was run.** What *was* run: a
  strict-flag `tsc` (exactOptionalPropertyTypes + noUncheckedIndexedAccess)
  over every new/changed file using **hand-written permissive stubs** for
  React/next-intl/shadcn/lucide/tRPC — 0 errors in my files. That proves
  internal consistency, **not** that third-party prop types match. Plus 60
  test cases (the six new `.test.ts` files; the pre-existing 4a/4b suites
  were not part of this run) executed against the real source under a
  small home-made shim, and 7 distinct deliberate mutations (IME guard
  removed; Safari-229 check removed; `>` → `>=`; join separator removed;
  history omitted from estimate; stale model id unchecked; clear-only-
  first-key), all caught. Real vitest may differ on edge
  semantics of the shim's matchers.
- **`trpc.models.list.useQuery`** is the first tRPC React hook in
  `apps/web`. Whether it types cleanly against `AppRouter` is unconfirmed.
- **Radix `Select`:** `SelectValue` with explicit children, and `value=""`
  showing the placeholder, are unverified (no Radix source offline).
- Real Arabic IME behavior (jsdom-free tests only cover the decision
  function, not a browser's event ordering).
- Whether any seeded model has a non-null `avgResponseTimeMs`.
- `HIDE_KITCHEN_SINK` now gates **three** `/dev` pages; the note in
  `chat-render/page.tsx` said to split it into a dedicated var at the
  third. Not done (env config is outside this phase) — flagged.

### DELETE list
None.

## Phase 4c — rework: sliders, inline composer toolbar, script-aware cost quote

Requested after 4c shipped green: temperature/top_p as sliders (not typed
numbers), attach/mic placeholders, and the model picker + parameters moved
into the composer's own bottom toolbar, Claude-style. Also answered two
open product questions (send-block vs. input limit; per-script token
estimation) and acted on both.

### What changed (all under `apps/web`, nothing frozen touched)
- **New:** `features/chat/lib/{token-estimate,cost-estimate,param-slider,
  composer-panels}.ts` (+ tests), `components/chat/composer-icon-button.tsx`,
  `features/chat/components/composer/{composer-panel,param-controls}.tsx`.
- **Rewritten:** `components/chat/composer.tsx` (toolbar-slot layout, gone:
  the standalone `metaLeft` token-counter usage from 4c's own preview —
  kept as a prop for kitchen-sink's demo card, which still passes plain
  strings), `features/chat/components/composer/{composer-bar,model-picker,
  parameters-panel}.tsx`.
- **Deleted:** `features/chat/lib/param-input.ts` + its test. Text parsing
  (`parseParam`/`paramToText`, the "outOfRange"/"notInteger"/"notANumber"
  errors) only existed because the old panel let people type numbers;
  sliders and a stepper can't produce an invalid value, so there is nothing
  left to parse. The three `chat.parameters.errors.*` strings are now
  unused in `apps/web`, kept in `messages/*.json` because deleting them is
  a separate content decision, not this rework's to make silently.
- **i18n:** added `chat.recordComingSoon`, `chat.costInput`,
  `chat.costReplyUpTo`, `chat.costInfo`, `chat.parameters.{info,resetOne,
  decrease,increase}`; reworded `chat.estCostTooltip` for the new line.
  ar/en parity re-checked (400/400 keys, no diff either direction).

### Decision — the input token "limit" and the cost line (product question)
Confirmed with the gateway: `apps/api/.../gateway.service.ts` blocks any
request over 95% of the model's context window before it reaches the
provider — that's a real limit, not decorative, because every model has a
hard context window regardless of what an aggregator's UI shows. What *was*
wrong was surfacing it as a live "N / limit" counter. Kept the 95% block
(byte-for-byte the server's own `chars/4` rule, in
`lib/context-estimate.ts`, unchanged from 4c) but replaced the always-on
counter with a warning that only appears from 80%, plus a new always-on
line: "≈ X credits · input" (`lib/cost-estimate.ts`). Output cost is a
separate lever (`max_tokens`); today an unset value means "provider
default, up to model max" — capping that by default is a backend product
decision and is only flagged here, not built.
**Not done, flagged for a backend decision:** a default (non-null)
server-side `max_tokens` ceiling to bound worst-case output cost.

### Decision — per-script token estimation (product question)
Confirmed the premise: BPE tokenizers spend more tokens per character on
Arabic (~2–3 chars/token vs. Latin's ~4) and on CJK (~1 char/token), and an
emoji is 1–4 tokens while JS `.length` reports it as 2 UTF-16 units. Built
`token-estimate.ts`, a code-point-classified weight table (Latin/digit/
ASCII-symbol/Arabic/Arabic-mark/CJK/astral(emoji)/BMP-symbol/other) that:
reduces to the server's exact `ceil(chars/4)` for plain English (regression
test), and quotes Arabic/CJK/emoji higher (also tested). This feeds the
cost line ONLY — the send-block above still uses the plain `chars/4` rule
on purpose, so client and server can never disagree about "too long".
**No tokenizer or network was available to calibrate this** — the weights
are derived from documented BPE behavior, not measured, and are labelled
"≈" everywhere they're shown. Real billing (`gateway.service.ts`) already
uses the provider's reported `usage`, not this estimate, so nothing about
actual charges changed.

### Rule 1 exception, logged as instructed (client-side money math)
`cost-estimate.ts` computes a credits figure in the browser. Rule 1 (docs
§3) says money is never computed client-side; this is a deliberate,
bounded exception: labelled "≈", never persisted, never sent to the
server, never used to gate Send. The authoritative number stays the
server's per-message `creditCost`. Flagged in the pre-build summary and
approved before writing any code.

### Known imprecision — `models.list` rounds prices up
`apps/api/.../models.router.ts` rounds credits-per-K UP to a whole number,
so a model actually priced at 0.3 credits/K lists as 1 and every quote for
it overstates by up to that rounding. `cost-estimate.ts`'s `unitPrice()`
already prefers optional `creditsPerKInputExact`/`creditsPerKOutputExact`
fields if the API ever adds them — no frontend change needed when it does.
**Not done, flagged for a backend decision:** add those exact fields.

### No new dependencies
No Radix `Slider`/`Popover` — a lockfile regeneration wasn't available
offline. Sliders are native `<input type="range">` (styled thumb only, see
`param-controls.tsx`'s header comment on why the track isn't); the model
list and parameters open as an in-flow panel (`composer-panel.tsx`) rather
than a portal, which also sidesteps the RTL/portal-positioning question
entirely — the panel is just as wide as the composer because it's laid out
inside it.

### Bugs fixed in my own first draft here
- `roundQuoteUp`: naive `Math.ceil(credits * 100) / 100` ticked `0.3` up to
  `0.31` on `0.1 + 0.2`-style float error. Fixed by subtracting a `1e-9`
  epsilon before the ceil; regression test added
  (`roundQuoteUp(0.1 + 0.2) === 0.3`).
- `stepMaxTokens`: a plain `current + step`/clamp couldn't reach a ceiling
  that isn't a multiple of the step (e.g. 200 with step 32 would stop at
  168 or overshoot to 232). Rewrote the "increase" branch's floor/ceiling
  clamp so the model's exact ceiling is always reachable in one press from
  its neighbour; test added.
- First draft's `<input type="range">` fill bar sized off the raw fraction,
  so at `min` and `max` the fill visibly over/undershot the round thumb by
  half its width. Fixed with a `calc()` that starts the fill at the thumb's
  centre, not the track's edge.

### Integration boundary — unchanged from 4c
Still not mounted in `/chat` (see 4c's own "Integration boundary" note
above — that gap is unchanged by this rework). Verify via
`/{ar,en}/dev/chat-composer` as before.

### How to verify
**CI:** `web-unit` (new: `token-estimate`, `cost-estimate`, `param-slider`,
`composer-panels`; `param-input`'s suite is gone with the file), `Type-check
& Lint` (logical-properties lint — every new class uses `ps-`/`pe-`/`ms-`/
`start-`/`end-`, checked by hand this round; grepped for physical
`left/right/ml/mr/pl/pr` and found none), `web-build`, `i18n-parity`.

**Preview** — `/ar` and `/en` at `/dev/chat-composer`, 360px and desktop,
both themes:
1. Toolbar reads `[+] [⚙] [Model ▾] … [🎙] [➤]` in that order in `en`, and
   mirrors under `dir="rtl"` in `ar` (buttons and the whole card flip; the
   slider tracks themselves stay LTR — numbers read low-to-high regardless
   of page direction, matching every numeric field elsewhere in the app).
2. Tap **⚙** → parameters panel opens above the card, full composer width;
   tap **Model** → it closes and the model list opens instead (only one
   open at a time); tap the same button again, press Escape, tap outside,
   or focus the textarea → panel closes.
3. Drag temperature/top_p → the ⚙ button grows a small dot (customised);
   "Reset" in the panel clears both sliders and the system prompt in one
   tap and the dot disappears.
4. Max response length: `−`/`+` moves by a step sized to the model's
   ceiling; both ends disable at their limit; switching to "Tiny context"
   (256-token ceiling) after setting a big value on "Large model" shows the
   value clamped to 256, not silently rewritten in storage.
5. Tap **+** or **🎙** → each shows its "coming soon" line under the card
   and does not block typing or sending.
6. Type a draft → "≈ X credits · input" appears; tap its ⓘ → the longer
   explanation opens inline; type the same length in Arabic → the credit
   number is visibly higher than the English case.
7. Repeat 4c's original context-limit and IME checks (unchanged
   send-block) — see 4c's own "How to verify" above.

### Not verified (no `tsc`/`next build`/browser/network in this sandbox)
- Same standing gap as 4c: no real `tsc`, `next build`, or `vitest` binary
  in this sandbox. What *was* run this round: a strict-flag `tsc`
  (`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`, the repo's
  own `tsconfig.base.json`) over every new/changed file against
  hand-written stubs for react/next-intl/shadcn/lucide — 0 errors; a
  server-side React render (`react-dom/server`) of the assembled
  `ComposerBar` and the slider/stepper/model-list pieces across 11
  fixtures (empty draft, English draft, Arabic draft, a draft that trips
  the "Tiny context" send-block, zero models, `parametersEnabled={false}`,
  default vs. set slider, default vs. maxed stepper, the model list) to
  catch render-time crashes and confirm the i18n keys resolve; and 56 new
  test cases for the four new lib files, executed against the real source
  under the same small home-made shim as 4c. None of that is real
  `vitest`/jsdom/a browser, so touch-drag behavior on an actual
  `<input type="range">`, RTL mirroring, and iOS Safari specifically remain
  unverified until CI and the preview.
- Real tokenizer counts for Arabic/CJK/emoji: the weights in
  `token-estimate.ts` are derived from documented BPE behavior, not
  measured against any provider's actual tokenizer (none reachable
  offline). Treat as ±30% until calibrated against real `usage` data.
- Whether `next-intl`'s real ICU interpolation handles the new
  `{credits}`/`{label}`/`{max}` placeholders identically to the plain
  `.replace()` used in the local stub — no next-intl runtime available
  offline.

### DELETE list
- `apps/web/features/chat/lib/param-input.ts`
- `apps/web/features/chat/lib/param-input.test.ts`

---

## Phase 4d — Chat: conversations + cache (partial — lib/hooks layer only)

**Scope actually received this round:** the phase summary approved earlier
(list groups, IndexedDB cache, new-chat id generation, sidebar/chat-view
components, both real pages) — but the file set attached for building only
covered the data layer: `conversation-cache.ts`, `conversation-grouping.ts`,
`new-chat.ts`, `use-conversations.ts`, `use-conversation-cache-identity.ts`,
and their tests. **The UI layer from the same summary was not included**:
`chat-view.tsx`, `conversation-sidebar.tsx` / `conversation-row.tsx` /
`conversation-search.tsx`, `use-conversation-messages.ts`, and the real
`/chat` + `/chat/[id]` pages. `app/[locale]/(app)/chat/page.tsx` is
therefore still Phase 2.1's placeholder — nothing in the app actually
mounts any of the code below yet. Per the plan's own rule 3 ("if the plan
contradicts the code, tell me before building"), flagging this now rather
than fabricating the missing components against an unseen composer/
message-list contract. Everything below is real, tested, and ready to be
imported by that UI layer once it lands.

### Contract gaps found while integrating the delivered files (fixed)
The five delivered files referenced three things that didn't exist yet
anywhere in the repo — not a plan/code contradiction, just the batch being
lib-first and these being the natural seams between files written together:
- `ConversationSummary` — imported from `../types` by `conversation-cache.ts`,
  `conversation-grouping.ts`, and `use-conversations.ts`, but `types.ts` had
  no such export. Added it: `{ id, title: string | null, modelId: string |
  null, isPinned, updatedAt: string }`, matching `GET /api/conversations`'s
  `columns` selection exactly (`title`/`modelId` are nullable columns per
  `packages/db/src/schema/conversations.ts` — neither has `.notNull()`).
- `listConversations` / `renameConversation` / `pinConversation` /
  `deleteConversation` — `use-conversations.ts` imports all four from
  `../lib/conversation-api`, matching the approved summary's "add list/
  rename/pin/delete calls next to the existing get/patch-system-prompt."
  Added, following `fetchConversationSystemPrompt`'s exact pattern
  (`ApiResult<T>` envelope, `credentials: "include"`, injectable
  `fetchImpl`). Verified against the real (frozen-zone, read-only) route
  handlers: `GET /api/conversations` → `{ items }`; `PATCH .../[id]` body
  `{ title }` or `{ isPinned }` → `{ success: true }`; `DELETE .../[id]` →
  `{ success: true }`, soft-delete.
- `getRealIdbStore` — `use-conversations.ts` imports it from
  `../lib/idb-store`, a file that didn't exist. `conversation-cache.ts` has
  its OWN real `idb-keyval` adapter, but it's deliberately private
  (module-internal, used only by that file's own sign-out-clearer
  registration — see that file's header comment on why its public surface
  stays real-`idb-keyval`-free for the `environment: "node"` test suite).
  Added `idb-store.ts` as a separate small adapter satisfying the same
  `KVStore` shape, rather than exporting the private one — keeps the
  "nothing importing conversation-cache.ts needs a real `indexedDB`
  global" property structural instead of a by-convention rule the next
  edit could quietly break. Documented in that file's header that this
  means two tiny `idb-keyval` wrapper closures now exist instead of one
  shared instance (harmless — `idb-keyval`'s functions are module-level
  and stateless — but worth a conscious yes/no rather than silently
  deduplicating into either file without being asked).

### What was actually run (real execution, not just reading)
No `pnpm`/`node_modules` in this sandbox (network disabled, nothing
installed) — same standing gap as every prior phase. What this phase adds
beyond 4c's "hand-written-stub `tsc` + SSR render" approach: an *actual*
`tsc --strict` (plus this repo's `exactOptionalPropertyTypes` +
`noUncheckedIndexedAccess`) run against the 11 files above (8 source + 3
test) using hand-written stub modules for `react`/`idb-keyval`/`vitest`/
`@/lib/{auth-client,client-cache}` — **0 type errors** — and then, going one
step further than a type-check: the three `.test.ts` files' actual logic
was executed under a minimal real test runner (`describe`/`it`/`expect`
that genuinely assert, not stubs that no-op) against a real in-memory
`idb-keyval` replacement (same `get`/`set`/`del` semantics, just backed by
a `Map` instead of real IndexedDB). Real results: **24 of 30 assertions
passed**; the 6 failures break down as:
- 1 failure (`crypto.randomUUID` stub) is this harness's limitation —
  Node's global `crypto` is non-configurable, so `vi.stubGlobal("crypto",
  …)` can't actually override it outside real vitest/jsdom. Not a code bug.
- **5 failures are a real, if low-probability, latent flake in
  `conversation-cache.test.ts`'s fixtures** — worth a look before this
  lands. Both `conv(id)` and `msg(id)` build `updatedAt`/`createdAt` from
  a fresh `new Date().toISOString()` on every call, and five assertions
  call the same fixture twice (once for the input, once for the expected
  value in `toEqual`) — e.g. `writeCachedConversationList("u1", [conv("a"),
  conv("b")], store)` then `toEqual([conv("a"), conv("b")])` re-invokes
  `conv` and can produce a different millisecond timestamp than the first
  call. In real (fast) vitest the two calls are normally sub-millisecond
  apart and this won't trip in practice, which is almost certainly why it
  hasn't been caught yet — but it's a genuine flake risk, not a
  theoretical one (it reproduced three separate times in this run at
  ~10-30ms apart under this sandbox's slower execution). The eviction/LRU
  logic itself (`touchIndex`'s clamped `splitAt`, the whole reason for
  this file's most carefully-commented line) **passed clean** — that was
  the one test worth the most scrutiny and it held up under real
  execution, not just a type-check.
  Suggested fix (not applied — flagging per rule 4, not silently rewriting
  someone else's delivered test file): freeze one `conv(id)` /
  `msg(id)` return value per test and reuse it for both the write and the
  `toEqual`, instead of calling the factory twice.
- All 10 `conversation-grouping.test.ts` assertions (calendar-day
  boundaries, the exactly-7-days-is-older case, DST-neutral local-midnight
  math) passed with zero caveats — no timestamp-freshness issue there
  since that file's fixtures take an explicit `updatedAt` string, never
  calling `new Date()` internally.
- `new-chat.test.ts`'s two non-crypto-stub assertions (UUID-v4 shape check
  on a real un-stubbed `crypto.randomUUID`, and the locale-prefixed path
  builder) passed.

### Not verified
- The React hooks (`use-conversations.ts`, `use-conversation-cache-
  identity.ts`) — no real React renderer available in this pass (unlike
  4c's SSR-render check, there is no consuming component yet to render
  them into; a bare hook isn't independently render-testable the way a
  finished component is). Read carefully by hand against `useSession`'s
  real shape and the four new `conversation-api.ts` functions' real
  signatures — everything lines up — but this is not the same as having
  run it.
- The real `idb-keyval` adapter bodies in both `conversation-cache.ts`
  (private) and the new `idb-store.ts` — three lines each, but the one
  piece no amount of stubbing reaches; genuine IndexedDB behavior (quota,
  Safari private mode, `structuredClone`-vs-JSON serialization
  differences for the cached arrays) is preview/CI-only, as flagged in
  `conversation-cache.ts`'s own header comment.
- Whether `use-conversations.ts`'s optimistic pin/rename/remove +
  rollback actually feels right against real network latency — logic
  read as correct (snapshot-then-restore-on-failure) but UX timing can't
  be judged without a browser.

### DELETE list
None this round — nothing shipped here supersedes an existing file.
`components/chat/chat-sidebar.tsx` (Phase 1.2's presentational-only
sidebar) is NOT a delete candidate yet: it's still the only thing
`app/[locale]/dev/kitchen-sink/kitchen-sink-client.tsx` renders, unlike
`message-bubble.tsx` (deleted in 4a once nothing referenced it). It
becomes a real delete candidate once `conversation-sidebar.tsx` lands and
kitchen-sink is updated to point at it instead — not before.

### How to verify once the UI layer lands
Cannot produce a real preview/CI list yet — there is no page or component
in this batch for CI's `web-build`/`i18n-parity` to build, and no route
for a human to click through. Re-request this section once `chat-view.tsx`
and the two real pages exist; until then the only honest verification is
what's above (type-check + logic execution against the lib files
themselves).

---

## Phase 4d — CI-confirmed test failures, fixed (post-delivery)

Real CI (`Web Unit Tests (vitest)`, screenshot supplied by the user) hit
exactly two bugs — both test-only, `conversation-cache.ts`/`new-chat.ts`
source unchanged:

1. **`conversation-cache.test.ts` fixture-freshness flake** — predicted in
   this file's own "not verified" section above and now confirmed with a
   real CI diff (`updatedAt`/`createdAt` off by 1ms between the write side
   and the `toEqual` side). Root cause: `conv(id)`/`msg(id)` stamp a fresh
   `new Date().toISOString()` on every call, and 8 assertions across the
   file called the same fixture twice — once to build the value being
   written, once again inside `toEqual(...)` for the expected value.
   **Fixed** in all 8 spots (not just the ones CI happened to catch this
   run — `msg("m9")`/`conv("z")`, `msg("m2")` in the delete test, the
   eviction test's last-written message, and the recency test's
   `m0-updated` had the identical latent issue and were one unlucky
   scheduler tick from failing too): capture the fixture once into a
   `const`, reuse that same value for both the write and the assertion.
2. **`new-chat.test.ts` stubbed-global leak across tests** — NOT
   something the earlier hand-rolled logic-execution pass could have
   caught (it used a bespoke `vi.stubGlobal`/`vi.restoreAllMocks` shim
   that happened to reset `crypto` on `restoreAllMocks`, which is not
   real vitest's behavior). Real vitest's `restoreAllMocks()` only undoes
   `vi.spyOn`/`vi.fn`; it does **not** touch `vi.stubGlobal`. The suite's
   `afterEach` called only `restoreAllMocks()`, so the first test's
   `vi.stubGlobal("crypto", { randomUUID: () => fixed })` stayed active
   into "produces distinct ids across calls" — both calls returned the
   same stubbed fixed UUID, exactly matching the CI failure ("expected X
   not to be X"). **Fixed**: `afterEach` now also calls
   `vi.unstubAllGlobals()`.

**Re-verified for real** (not just read): re-ran the same real-logic
harness from this phase's first entry above (real `describe`/`it`/
`expect`, in-memory `idb-keyval` stand-in, and this time a corrected
`stubGlobal`/`unstubAllGlobals` pair that actually swaps a global out and
back). Result: 29/30 assertions pass; the 1 remaining "failure" is the
harness's own known limitation (a plain-assignment stub can't override
Node's non-configurable `crypto` global the way real vitest's
`Object.defineProperty`-based `stubGlobal` can) — that specific assertion
already passed in the user's real CI run per the screenshot, so this is
not a live gap, just this sandbox's stand-in reaching its ceiling.

### Still true, unchanged by this fix
`/en/chat` still shows the Phase 2.1 placeholder — this round only touched
two test files. The UI layer (`chat-view.tsx`, sidebar components,
`use-conversation-messages.ts`, the two real pages) is still outstanding;
CI going green on `Web Unit Tests` does not mean the phase is done, only
that the lib layer's tests no longer flake.

---

## Phase 4d — UI layer delivered

The lib layer landed in the round above; this round is the actual UI:
`chat-view.tsx`, the three sidebar components, `use-conversation-messages.ts`,
and the two real pages. `/{locale}/chat` no longer shows the Phase 2.1
placeholder.

### What shipped this round

- `features/chat/lib/conversation-api.ts` — added `fetchConversationMessages`.
  Not previously present despite being assumed by `use-conversation-messages.ts`
  in an earlier draft of this round; added for real, with a `mapRow` step
  that converts the DB row's `null` nullable columns (`feedback`, `modelId`,
  `inputTokens`, `outputTokens`, `creditCost`) into OMITTED keys, matching
  `ChatMessage`'s optional-field (never-null) contract under this repo's
  `exactOptionalPropertyTypes`. A 404 maps to `{ ok: true, value: [] }`,
  not a failure — the gap between `new-chat.ts` generating an id/navigating
  and the gateway's lazy insert landing on first send means `/chat/[id]`
  can legitimately be visited before a row exists yet.
- `features/chat/hooks/use-chat-stream.ts` — added the `initialMessages`
  option, via `useReducer`'s 3-argument lazy-init form (read once, on this
  hook's first render only — see the option's own doc comment for why a
  later prop change deliberately does NOT re-seed). Also not previously
  present despite `chat-view.tsx` depending on it.
- `features/chat/hooks/use-conversation-messages.ts` — `/chat/[id]`'s
  history loader, same cache-first-then-network shape as `use-conversations.ts`.
- `features/chat/components/sidebar/{conversation-search,conversation-row,
  conversation-sidebar}.tsx` — search input, one row (normal/renaming modes,
  pin/rename/delete-with-confirmation), and the assembling sidebar
  (new-chat button, search, Pinned section, Today/Yesterday/This week/Older).
- `features/chat/components/chat-view.tsx` — the assembly point. Splits into
  an outer `ChatView` (loads history) and inner `ChatSession` (only mounts
  once history has resolved, `key`'d on conversation id) so `useChatStream`'s
  lazy-init `initialMessages` always sees the real history on its first
  render, never an empty array that would then be permanently locked in.
  New-chat handoff goes through `pending-first-message.ts`: the empty
  state's composer generates the id, stashes the draft, navigates; the
  freshly-mounted `/chat/[id]` session picks it up and sends it itself,
  after the navigation completes (see that file's header comment for why
  it can't happen before — `useChatStream` aborts its own in-flight
  request on unmount, and `/chat` → `/chat/[id]` is a full unmount).
- `app/[locale]/(app)/chat/page.tsx` — replaced the placeholder. Full-height
  sidebar + `ChatView` row, not `SectionPage` (that component width-caps
  and pads for a form/dashboard page; chat is the first `(app)` page that
  needs to fill `<Main>` edge-to-edge).
- `app/[locale]/(app)/chat/[id]/page.tsx` — new. Client component reading
  `id` via `useParams()`; no server wrapper, since every hook underneath
  is client-side anyway and every real read/write re-derives ownership
  from the session server-side regardless (confirmed by re-reading
  `app/api/conversations/[id]/route.ts`, frozen/read-only, this round).
- `messages/{ar,en}.json` — added `chat.searchConversations`,
  `chat.moreOptions`, `chat.deleteConfirmBody` (the last takes a `{title}`
  placeholder, matching `conversation-row.tsx`'s call site). Both files
  re-checked for key-set parity after the edit (`python3 -c` diff of the
  two `chat` key sets — empty on both sides).

### A known, flagged simplification (not silently dropped)

`chat-view.tsx` calls `useChatModels({})` with no `conversationModelId` —
that option exists to let an EXISTING conversation's own model win over
the user's last-picked one, but the data source that would supply it
(`useConversationMessages`) returns only the message array, not the
conversation row's `modelId` column. Wiring that through would mean
widening `UseConversationMessagesResult`'s contract beyond this phase's
scope. Left as-is with a comment at the call site rather than expanded
silently: on an existing conversation, the model picker currently falls
back to the user's last-picked model (or the first available one)
instead of that conversation's own. A real gap, worth a follow-up.

### Verification

**Still cannot run `tsc`/`vitest`/`next build`/a browser in this sandbox**
— no network access (confirmed via the container's egress config) and no
`node_modules` in the delivered zip, so nothing here has been executed for
real, only read closely. What was actually done in place of execution:

- Every new import in every changed file was traced by hand to a real
  exported symbol in the target file (not assumed from memory) —
  `Skeleton`, `useSession`, `MessageList`, `ComposerBar`, `OfflineBanner`,
  `TabConflictBanner`, `DropdownMenu*`, `AlertDialog*` (including
  `DropdownMenuItem`'s `variant="destructive"` prop, which does exist),
  `fetchConversationMessages`, `readCachedMessages`/`writeCachedMessages`,
  `getRealIdbStore` — all confirmed present with matching signatures.
- Brace/paren/bracket balance checked programmatically across every
  touched file (all balanced) as a crude syntax sanity pass in place of
  a real parser.
- `messages/en.json` and `messages/ar.json` both re-parsed as JSON and
  diffed key-by-key under `chat.*` — parity confirmed, zero keys on
  either side alone.
- Read `app/api/conversations/[id]/route.ts` again (frozen, read-only)
  to confirm the exact response shape `fetchConversationMessages` parses
  against (`{ ...conv, messages }`, 404 on not-found-or-not-owned) rather
  than assuming the earlier round's documented contract was still accurate.

**Not verified, flagged rather than assumed:**
- `use-chat-stream.ts`'s new `initialMessages` option has NO test. This
  repo's `vitest.config.ts` runs `environment: "node"` with no jsdom and
  no `@testing-library/react` (see that file's own header comment) — a
  hook built on `useReducer`/`useEffect`/refs isn't reachable through the
  `renderToStaticMarkup` SSR-only approach this codebase uses for
  component tests (that approach renders once and stops; it can't dispatch
  an action or resolve an effect). Confirmed by hand against
  `chat-stream-reducer.ts`'s own tested behavior, but not executed.
- `conversation-sidebar.tsx` and `conversation-row.tsx` have no test for
  the same reason PLUS a second one: `conversation-sidebar.tsx` calls
  `useConversations`, which calls `useSession`/tRPC — real hooks this
  sandbox has no mock for and no established `vi.mock` precedent in this
  codebase to follow (every existing `.test.tsx` here is a dependency-free
  SSR render). `conversation-search.tsx` (a pure controlled input, no data
  hooks) DOES have a real SSR test — `conversation-search.test.tsx` —
  written in this round, following `safe-markdown.test.tsx`'s exact
  pattern; it confirms the component renders under `next-intl` with the
  real `en.json` string, the `ps-9` logical-padding class survives (Rule 2),
  and the controlled `value` reaches the DOM. It does not and cannot
  prove `onChange` fires on a real keystroke (no live DOM to dispatch an
  event into).
- The two page files' actual runtime navigation behavior — `useParams()`
  reading the dynamic segment, the sidebar's `onSelect`/`onNewChat`
  round-tripping through `next/navigation`'s `useRouter` — read as
  correct against Next 15's client-component API, no precedent for
  `useParams()` existing elsewhere in this repo to compare against (every
  other dynamic route in this codebase reads `params` server-side instead;
  this is the first client dynamic-segment page), so this is a slightly
  higher-uncertainty item than usual, flagged rather than asserted.
- `useChatModels({})`'s missing `conversationModelId` — see the
  simplification note above; not a bug so much as a known incompleteness.
- Preview-only, as every round: reload-restores-instantly and
  sign-out/sign-in-as-another-user-shows-nothing (Rule 9's two "done when"
  checks), pin/rename/delete's actual round-trip feel, RTL rendering of
  the new sidebar under `dir="rtl"` (nothing here was checked in a real
  browser, only read for logical-property usage — `ps-9`/`ms-*`/`me-*`,
  no bare `pl-*`/`mr-*`/`ml-*` in any new file, confirmed by grep).

### DELETE list

None. `components/chat/chat-sidebar.tsx` (Phase 1.2's presentational-only
sidebar) is STILL not a delete candidate — re-confirmed this round by
grepping `kitchen-sink-client.tsx`, which still imports and renders it
directly (`ChatSidebar`/`ChatSidebarConversation`). It becomes a real
delete candidate once kitchen-sink is updated to point at the new
`ConversationSidebar` instead — a follow-up, not done here, since nothing
in this round's scope touches the dev kitchen-sink page.

### How to verify (once this lands in a real environment)

- **CI:** `Type-check & Lint` (`tsc --noEmit`, `next lint`) — the class of
  error this sandbox could not run for real; `web-build` (`next build`) —
  will also catch any RSC/client-boundary mistake in the two new page
  files; `Web Unit Tests (vitest)` — `conversation-api.test.ts`'s new
  `fetchConversationMessages` suite, `conversation-search.test.tsx`'s SSR
  render, plus every already-green suite from the prior round;
  `i18n-parity` — should pass given the manual key-parity check above,
  but this is exactly the kind of check worth letting CI itself confirm
  rather than trusting a local diff.
- **Preview, `/en/chat` and `/en/chat/[id]`:**
  - Empty state renders (heading + suggestion chips), picking a
    suggestion fills the composer without sending.
  - Sending from the empty state navigates to `/en/chat/{new-uuid}` and
    the message actually sends (not lost across the navigation) —
    this is the exact race `pending-first-message.ts` exists to close;
    worth deliberately watching the Network tab across the navigation.
  - Reload on an existing `/chat/[id]` restores the conversation
    instantly from cache, then reconciles with the network.
  - Sidebar: new-chat button, search filters by title only (not
    modelId), pin/unpin/rename/delete round-trip against the real
    PATCH/DELETE routes, delete requires the confirmation dialog.
  - Sign out, sign in as a second test account: sidebar shows none of
    the first account's cached conversations (Rule 9's own "done when").
  - `/en` and `/ar`, both directions: RTL sidebar layout, RTL delete
    confirmation dialog, search icon on the correct logical side.
  - A conversation whose `modelId` differs from the signed-in user's
    last-picked model: confirm whether the picker shows the
    last-picked/first-available model (expected, per the flagged
    simplification above) rather than treating a mismatch as a bug.

## Phase 4d Patch v2 — Mobile chat nav redesign (conversation list moves to shell level)

- **What changed:** `ConversationSidebar` gained a `limit` prop (caps at
  10, pinned first, with a "View all chats →" link to `/chat/all` once
  the real count exceeds it) and a `listClassName` prop so it can be
  embedded without its own nested scroll region. New
  `ConversationFullList` + `/chat/all` page give the uncapped view with
  a round floating "new chat" button (`end-4 bottom-4`, never
  `right-`/`left-`). `AppSidebar`/`SidebarNav` now embed the (capped)
  conversation list above the role-filtered nav groups, and render on
  **every** route via `AppShell`, not just the two chat pages — the
  inline `ConversationSidebar` in `chat/page.tsx` and `chat/[id]/page.tsx`
  is gone; both now render only `ChatView`. `AppShell` derives
  `activeConversationId` from `usePathname()` (excluding the literal
  `/chat/all` segment) and provides `onSelectConversation`/`onNewChat`
  via `useRouter()`, passed to both `AppSidebar` and `MobileDrawer`. The
  `"chat"` entry was removed from `config/nav.ts`'s main group — the
  embedded list already owns that destination, so a second link to the
  same place was redundant. `messages/{en,ar}.json` gained
  `chat.viewAllChats` and `chat.allChatsTitle`, parity-checked (both
  files have identical key sets after the edit).

- **Admin visibility — confirmed from code, not assumed:**
  `getNavGroups(role)` in `config/nav.ts` filters the `admin` group by
  `roles: ADMIN_ROLES`, and `normalizeRole()` fails closed for any
  unknown/missing role. This was unchanged by this patch and needed no
  fix — a regular user's embedded sidebar/drawer never renders the admin
  group; the screenshot the request was built from showed it only
  because that session was signed in as superadmin.

- **Could not verify without running the code:**
  - Whether nesting `ConversationSidebar` (with `listClassName=""`,
    `flex-none`) inside `SidebarNav`'s own `overflow-y-auto` `<nav>`
    actually lays out as intended (one shared scroll for New
    Chat/search/list/nav-links together) rather than the list's own
    `flex flex-col` producing an unexpected height in a parent whose
    height comes from `overflow-y-auto` content-sizing rather than a
    hard pixel value. This is exactly the class of thing Phase 4d's
    original gap (a real-device-only bug) came from, so it needs the
    same real-phone-width check called out below before being trusted.
  - Whether `AppShell` now mounting `useConversations` unconditionally
    on every `(app)`/`(admin)` route (previously only on the two chat
    pages) causes a visible list flash or extra fetch when navigating
    away from and back to `/chat` — the hook's cache-first IndexedDB
    read should mask this, but it wasn't exercised here.
  - `pnpm install` was not possible in this sandbox (no network egress,
    no `node_modules` in the provided zip), so none of `type-check`,
    `lint`, `next build`, or `vitest` were actually run against these
    changes — CI is the first real execution of any of it.

- **CI:** same jobs as prior phases — `type-check`/`lint` (would catch
  any prop-mismatch from the `ConversationSidebar` signature change, and
  Rule 2's lint ban on literal `right-`/`left-` classes on the new FAB
  and "View all chats" chevron), `next build` (RSC/client-boundary
  correctness of the new `/chat/all` route and the simplified chat
  pages), `vitest` (`nav.test.ts` should still pass with `"chat"`
  removed from `NAV_GROUPS` — nothing in it asserts that entry exists),
  `i18n-parity` (new `chat.viewAllChats`/`chat.allChatsTitle` keys are
  present in both locale files).

- **Manual, real phone width, both locales (this is the gap that caused
  the original bug — do not substitute a resized desktop browser):**
  - `/chat`, `/chat/[id]`, `/chat/all`, and one non-chat route (e.g.
    `/admin` for a superadmin account) — confirm the sidebar/drawer
    content is identical across all of them (same capped list, same
    "View all chats" link, same nav links below the divider).
  - Confirm the drawer never renders alongside a second, desktop-only
    `ConversationSidebar` — there should be exactly one conversation
    list on screen at any viewport width.
  - FAB on `/chat/all` and the "View all chats" link/chevron sit on the
    correct logical side under `dir="rtl"`.
  - A non-admin test account's drawer and desktop sidebar both show no
    admin section (expected per the code-confirmed finding above — this
    is a regression check, not expected to surface anything new).
  - Selecting a conversation from the drawer closes the drawer AND
    navigates (both `onSelectConversation` and `onNavigate` firing from
    the same click, per `SidebarNav`'s wiring).

## Mobile chat layout fix — composer no longer scrolls with the conversation

- **Root cause:** not in the chat feature at all — `components/layout/main.tsx`
  (`<Main>`) and `AppShell`'s root only ever had `flex-1`/`min-h-dvh`, never a
  definite, capped height. On mobile, once a conversation's message list grew
  taller than the viewport, the whole page grew with it (native page scroll)
  instead of `MessageList`'s own internal `overflow-y-auto` doing the
  scrolling — dragging the composer up/down with the transcript. Compounding
  it, `MessageList` was handed `className="flex-1"` with no `min-h-0`, so
  even if the ancestor chain had been bounded, this element's flex
  default (`min-height: auto`) would still have let it grow to fit its
  own content rather than shrink to the space available and scroll.

- **Fix (three files, one chain):**
  - `AppShell` root: `min-h-dvh` → `h-dvh overflow-hidden` (matches
    `AppSidebar`'s own `h-dvh`), and its inner column wrapper gained
    `min-h-0`.
  - `Main`: `flex-1` → `flex min-h-0 flex-col overflow-y-auto`. This is
    also what keeps every OTHER page (billing, settings, admin —
    none of which manage their own height) scrolling normally now that
    the page/root itself no longer can.
  - `chat-view.tsx`: `MessageList` and the empty-state/loading-skeleton
    containers all gained `min-h-0` alongside their existing `flex-1`, so
    they actually shrink to `ChatSession`'s available height and let
    their own `overflow-y-auto` engage instead of stretching it.
  - Net effect: on chat routes, `ChatView` fills `Main`'s `h-full`
    exactly; `MessageList` (not `Main`, not the page) is the one
    scrolling region; `ComposerBar` (no `flex-1`) sits at its natural
    size below it and never moves.

- **Could not verify without running the code:** this is CSS/layout
  behavior depending on the full flexbox chain resolving at runtime
  across four nested components — the reasoning is sound and matches
  the working pattern `AppSidebar` already used (`h-dvh`), but it needs
  the same real-phone check called out for the nav patch: open a long
  conversation on an actual device (not a resized desktop browser),
  scroll up through history, and confirm the composer and header never
  move. Also worth a once-over on `/billing`, `/settings`, `/admin` to
  confirm they still scroll normally now that `Main` (not the page body)
  owns that scroll.

- **CI:** same jobs as before — `type-check`/`lint`/`next build` would
  catch any JSX/className mistake in these edits; no new job needed;
  nothing here is unit-testable (pure layout/CSS).

## Phase 4d Patch v3 — horizontal overflow fix + conversation modelId wiring

- **Reported symptom (screenshots):** on mobile, a message bubble could be
  panned/dragged left and right, cropped at both edges — the page was
  horizontally scrollable, which it should never be.

- **Root cause:** the vertical-scroll fix in Patch v2 (above) bounded
  every ancestor's *height*, but nothing in that chain bounded *width*.
  A flex item's default `min-width` is `auto` (its content's intrinsic
  width), not `0`. `message.tsx`'s outer row, `SafeMarkdown`'s root
  `div`, and `MessageList`'s scroll container all omitted `min-w-0`, and
  the two actual text nodes (the user bubble's `whitespace-pre-wrap` div,
  and every plain-text node `SafeMarkdown` renders) had no
  `break-words`/`overflow-wrap` rule at all. One long unbroken token in a
  message (a URL, a hash, a path) was therefore free to force its row
  wider than the viewport instead of wrapping, and with nothing upstream
  clipping horizontally either, that widened row is what let the whole
  page pan.

- **Fix (four files):**
  - `message.tsx`: `min-w-0` added to the outer row; `break-words
    [overflow-wrap:anywhere]` added to the user bubble's content div;
    `min-w-0` added to the `SafeMarkdown` wrapper via its `className` prop.
  - `safe-markdown.tsx`: `min-w-0 break-words [overflow-wrap:anywhere]`
    added to the component's own root `div`. Fenced code blocks are
    unaffected — `CodeBlock`'s `<pre className="overflow-x-auto">`
    already scrolls internally rather than wrapping, and this rule never
    reaches it (only plain-text nodes: p/li/blockquote/inline code).
  - `message-list.tsx`: `min-w-0 overflow-x-hidden` added to the scroll
    container as a backstop, one level above the per-message fix.
  - `chat-view.tsx`: `min-w-0` added to `ChatSession`'s root div, closing
    the same gap one level further up (it's `Main`'s flex child).

- **Could not verify without running the code:** same caveat as Patch v2
  — no node_modules/build tooling available in this session, so nothing
  below was actually run: `pnpm --filter web type-check`,
  `pnpm --filter web lint`, `pnpm --filter web test`. Only a coarse
  brace-balance check was done by hand. Needs a real device check too:
  send a message containing one long unbroken string (~200 chars, no
  spaces) at a phone-width viewport and confirm it wraps with no
  horizontal pan, on both `/chat` and an existing long conversation.

- **Also in this patch — conversation modelId wiring** (closes the
  flagged simplification from the original 4d session, see that entry
  above `useChatModels({})`): added `fetchConversationModelId` to
  `conversation-api.ts` (a third independent GET to
  `/api/conversations/[id]`, same pattern as the existing
  system-prompt/messages split — see that file's own header comment for
  why these stay separate functions rather than one widened response).
  `useConversationMessages` now also returns `conversationModelId`;
  `chat-view.tsx` passes it into `useChatModels({ conversationModelId })`.
  A failure on this specific fetch is swallowed to `undefined`, not
  surfaced as the hook's `isError` — `useChatModels`'s own fallback chain
  (session pick → conversation's model → last-picked → first available)
  already degrades gracefully, and this is a cosmetic preselection detail,
  not something that should block or error out the whole conversation view.
  Unit-tested in `conversation-api.test.ts` (5 new cases, mirroring the
  existing `fetchConversationMessages` suite's shape). The hook itself
  (`use-conversation-messages.ts`) has no test file, consistent with the
  rest of that file's pattern — not newly introduced by this patch.

- **CI:** `type-check`/`lint`/`test`/`next build` — same jobs as every
  prior phase, no new job needed. `test` is the one that actually
  exercises new behavior (`conversation-api.test.ts`); the rest is
  layout/CSS plus one new hook field with no dedicated test.

## Phase 4d Patch v4 — GFM tables were the real remaining overflow source

- **Still broken after Patch v3 deployed.** Patch v3's `min-w-0` +
  `break-words [overflow-wrap:anywhere]` chain only fixes overflow from
  unbroken TEXT (a long word/URL/hash). It does nothing for a `<table>`:
  `remark-gfm` (already enabled) turns GFM pipe-tables into a plain HTML
  `<table>`, and `safe-markdown.tsx` had no `table`/`tr`/`th`/`td`
  override at all before this patch. A `<table>` doesn't shrink to its
  parent — the browser's table layout algorithm widens it to fit the
  widest cell, ignoring the column's available width, entirely
  independent of word-wrapping. Any assistant response containing a
  table reproduced the exact symptom regardless of Patch v3.

- **Fix:** `safe-markdown.tsx` now overrides `table` to render inside
  `<div className="overflow-x-auto">` (same pattern `CodeBlock` already
  uses for `<pre>`), plus `thead`/`tr`/`th`/`td` overrides for RTL-aware
  alignment (`text-start`) and spacing. A wide table now scrolls
  internally instead of widening the page.

- **Test added:** `safe-markdown.test.tsx` — new case renders a 2-column
  GFM table and asserts the `overflow-x-auto` wrapper div is actually
  present around the `<table>` (regression guard, HTML-string assertion
  matching this test file's existing SSR-string style).

- **Could not verify without running the code:** same caveat as v2/v3 —
  no node_modules/build tooling in this session. Also could not confirm
  from the report alone that a table was actually present in the
  reproducing message — this is the most likely remaining overflow
  source given what Patch v3 already covers, but worth confirming on the
  next real-device check: does the offending message contain a `|...|`
  table, and does resending it now stay contained?

## Phase 4d Patch v5 — code blocks specifically, two more gaps closed (unconfirmed)

- **Report:** still overflowing after v3+v4, and it's code blocks
  specifically, not tables.

- **Traced the chain by hand again** (no working build in this session —
  this whole analysis is static CSS/flexbox reasoning, not an observed
  render): `CodeBlock`'s `<pre>` already had `overflow-x-auto` before any
  of these patches, and per the flex "automatic minimum size" spec, an
  item with `overflow: auto`/non-visible should contribute zero to an
  ancestor flex container's forced width once every flex item up the
  chain has `min-w-0` — which, after v3, it does (`SafeMarkdown`'s root
  div is a direct flex item of the message's flex-col content column and
  already has `min-w-0`). By that reasoning code blocks should already
  have been fixed by v3. Two gaps found anyway, both fixed defensively:
  - `chat-view.tsx`: `ChatView`'s own wrapper (rendered before
    `ChatSession` mounts, one level up in the same flex chain) never got
    `min-w-0` in v3 — only `ChatSession`'s root did.
  - `code-block.tsx`: the fenced-code wrapper `div` and the `<pre>` itself
    now get explicit `min-w-0 w-full max-w-full`, rather than relying on
    normal block-flow inheritance through a `dir="ltr"` switch inside an
    RTL document — a plausible but NOT confirmed source of a mobile
    rendering inconsistency specific to this one node (it is the only
    place in the chain that both holds genuinely unbreakable content by
    design AND flips text direction).

- **Explicitly NOT confirmed:** unlike v3/v4, I do not have a specific,
  traceable root cause here I can point to with confidence — the CSS
  spec reasoning says this should already have been fixed by v3. Asked
  the user for a fresh screenshot of the actual code-block overflow
  before treating this as resolved, and to confirm whether v3/v4 were
  actually live on the deployment they tested (a stale/cached preview
  would reproduce exactly this "still broken" report even if the fix is
  correct).

## Phase 4d Patch v6 — no-avatar + the real source of the header/composer gap

- **Report:** two flat, same-background-colour strips — a larger one
  between the header and the first message, a smaller one above the
  composer — both fixed regardless of scroll, both present even though
  nothing visibly renders in them. Also asked to remove the round
  user-initial/"AI" avatar from every message row.

- **Root cause, confirmed (not just reasoned) this time:** the person used
  the deployed preview's own DevTools element picker and isolated it
  themselves — `chat-view.tsx`'s `ChatSession` root div,
  `className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-4"`.
  Toggling `.p-4` off in the Styles panel visibly shrank the gap,
  confirming it directly rather than by static code reading. `p-4`
  (16px all sides) was the strip below the header; the flex `gap-3`
  (12px) between `MessageList` and `ComposerBar` was the smaller one
  above the composer — two different CSS rules producing two different
  sizes, which is why the person correctly described them as unequal.

- **Fix (5 files):**
  - `chat-view.tsx`: `ChatSession`'s root div drops `gap-3 p-4` entirely.
    Each child now owns its own inset instead: the banner row gets
    `px-4` (horizontal only — an empty `OfflineBanner`/`TabConflictBanner`
    pair collapses to 0 height, so no padding-driven strip reappears
    when neither is showing); the "Stop" button and the composer are
    each wrapped in their own `px-4 …` div with a small, deliberate
    `py`/`pt`/`pb`; `EmptyState` gained `px-4 py-6` since it no longer
    inherits the parent's padding.
  - `message-list.tsx`: the scrollable container itself now carries
    `px-4 py-3` (previously just `px-1`) — it's the only source of inset
    around the transcript now. Also wrapped in a new `relative` outer div
    holding two `pointer-events-none` gradient overlays (`h-4`,
    `bg-gradient-to-b`/`to-t`, `from-background to-transparent`) pinned to
    its own top and bottom edges — the "shadow that fades" option from the
    original ask, replacing the hard padding edge with a soft dissolve
    into whatever sits above/below (header, composer). `className` from
    the caller (`"min-h-0 flex-1"`) now lands on this outer wrapper
    instead of directly on the scroll div, which itself gained `h-full` to
    fill it.
  - `message.tsx`: removed the `Avatar`/`AvatarFallback` block and the
    `userInitial` prop. The row is now a single column (no more
    avatar + bubble pair), with `flex-row-reverse` replaced by `ms-auto`
    on that column for user-turn end-alignment, since there's no longer a
    second flex child to reverse against.
  - `message-list.tsx` / `chat-view.tsx`: `userInitial` removed from the
    prop chain (`MessageList` → `Message`); `chat-view.tsx` also drops the
    now-unused `useSession` import and `session.user.name` derivation
    that only existed to compute it.
  - Two `/dev` fixtures (`dev/chat-render/chat-render-client.tsx`,
    `dev/kitchen-sink/kitchen-sink-client.tsx`) still passed
    `userInitial="ف"` into `MessageList` — removed from both so the
    removed prop doesn't fail type-check.

- **Could not verify without running the code:** same standing caveat as
  every prior patch in this log — no `node_modules`/build tooling in this
  session, so `type-check`/`lint`/`test`/`next build` were not actually
  run, only read/edited by hand with a brace/paren balance check. This
  patch is lower-risk than v2–v5 in one respect: the root cause was
  confirmed live by the person via the deployed preview's own inspector
  before any code was touched, rather than inferred from static reasoning
  alone. Still worth a real-device pass to confirm: the header/composer
  edges now read as intentional (not a bug), the top/bottom fades look
  right in both light and dark themes (the gradient uses the `--background`
  token so it should track the active theme automatically, but this
  wasn't visually confirmed), and no message is hidden behind the fade
  overlays (`pointer-events-none` should guarantee this, but real-device
  tap-through wasn't tested).

- **CI:** `type-check`/`lint`/`test`/`next build` — same jobs as every
  prior phase. No new test added (pure layout/CSS + a prop removal); the
  type-check job is the one that would actually catch a missed
  `userInitial` call site if this list missed one.

## Phase 4d Patch v7 — Send↔Stop morph, visible conversation-row menu

- **Report 1:** the "Stop" pill floating above the composer should go
  away; the Send button itself should turn into a stop icon while a
  response is streaming, same size, outline style.
- **Report 2:** the conversation-row "⋯" (more options) trigger in the
  sidebar was invisible at rest — only appeared once tapped, so there
  was no visible sign the option existed at all.

- **Fix 1 — Send↔Stop (3 files):**
  - `components/chat/composer.tsx`: new `isStreaming`/`onStop` props.
    The Send button no longer swaps DOM nodes — it's one button with two
    absolutely-stacked icons (`ArrowUp`, `Square`) cross-fading via
    opacity+scale (`transition-all duration-200`), and the button's own
    fill switches from solid `bg-primary` to an outline
    (`border-primary`, transparent) while streaming. Unlike ordinary
    Send, the button is never `disabled` while `isStreaming` — it has to
    stay tappable to interrupt the very thing that's disabling normal
    Send elsewhere in the card.
  - `composer-bar.tsx`: threads `isStreaming`/`onStop` through to
    `<Composer>` (same `exactOptionalPropertyTypes`-safe conditional-spread
    pattern already used for `sendBlockedReason`).
  - `chat-view.tsx`: deleted the standalone `isBusy && <Button>Stop</Button>`
    block entirely; `ComposerBar` now gets `isStreaming={isBusy}` and
    `onStop={() => stream.stop()}`. The now-unused `t` in `ChatSession`
    (only used for the old Stop button's label) was removed too —
    `EmptyState` has its own separate `t`, untouched.

- **Fix 2 — visible menu trigger (1 file):**
  - `sidebar/conversation-row.tsx`: the trigger button was
    `opacity-0` at rest, reaching `opacity-100` only via `:hover` /
    `:focus-visible` — both are no-ops on a touch device (no hover, and
    focus-visible only follows keyboard nav), so on mobile the button was
    invisible until a tap happened to land on its hitbox anyway. Rest
    state is now `opacity-60` (dim, not gone), full opacity on
    hover/focus/open, and `[@media(hover:none)]:opacity-60` pins the same
    60% on touch devices — the identical pattern `message.tsx`'s
    `MessageActions` already uses for the same reason.

- **Could not verify without running the code:** same standing caveat —
  no build tooling in this session. The morph animation in particular is
  pure CSS reasoning (never test-rendered); worth a real-device check
  that the cross-fade looks smooth rather than jumpy, and that tapping
  Stop mid-fade doesn't miss (the `pointer-events-none` on both icons
  should route every tap to the button itself throughout the
  transition, but this wasn't observed running).

- **CI:** `type-check`/`lint`/`test`/`next build` — same jobs, no new
  ones. Nothing here is unit-testable (pure JSX/CSS + prop threading).

## Phase 4d Patch v8 — Streaming re-render/highlight cost, user-message markdown

### Problem reported
1. Assistant response streaming appears to get slower as it goes on.
2. Request: render user messages as markdown too (currently plain text
   by Phase 4d's original design — see the old header comment in
   message.tsx, now replaced).

### Root cause (1) — not the network, not the reducer
`stream-reader.ts` calls `onChunk` synchronously per `reader.read()`
resolution with no batching (correct, unchanged). `chat-stream-
reducer.ts`'s CHUNK handling is a cheap array `.map()` + string
concatenation (correct, unchanged). The cost was in `SafeMarkdown`:
`ReactMarkdown` + `remarkGfm` + `rehypeHighlight` re-parses and
re-syntax-highlights the ENTIRE accumulated message string on every
single chunk, and neither `Message` nor `MessageList` was memoized, so
every other row in the transcript re-rendered on every chunk too. Cost
per chunk grows with message length → total cost across a stream grows
roughly quadratically with response length. This reads exactly as
reported: fine at the start of a response, visibly laggy by the end,
worse on code-heavy answers (rehypeHighlight is the most expensive part).

### Fix
- `use-chat-stream.ts`: deltas are now coalesced into a buffer and
  flushed to the reducer via a single `CHUNK` dispatch per animation
  frame (`requestAnimationFrame`), instead of one dispatch per network
  chunk. `onDone`/`onStopped`/`onPartial` synchronously flush any
  remaining buffered text first (`flushNow`) so no trailing content is
  ever dropped; `onError` clears the buffer instead of flushing it, so
  it doesn't change chat-stream-reducer.ts's existing "empty draft on
  error is dropped" contract (ERROR only checks `content.length === 0`
  at the moment the action lands). rAF cleanup added to the existing
  unmount effect.
  - This bounds re-render/re-highlight frequency to ~60/s regardless of
    how fast the network delivers bytes. It does NOT change what content
    ends up on screen or in the reducer — same bytes, same final state,
    just coalesced into fewer, larger appends. `stream-reader.ts` and
    `chat-stream-reducer.ts` are both untouched.
- `message.tsx`: `Message` wrapped in `React.memo` with an explicit
  field-by-field comparator (documents exactly what streaming vs. user
  action changes, rather than relying on shallow-equal by accident).
  Stops every other row in the transcript from re-rendering while one
  message streams.

### Fix (2) — user messages now render as markdown
`message.tsx`: user bubble now renders `message.content` through the
same `SafeMarkdown` component the assistant turn uses, instead of a
raw `whitespace-pre-wrap` div. `SafeMarkdown`'s own sanitization rules
(no rehype-raw, no dangerouslySetInnerHTML, blocked remote images,
forced `rel=noopener noreferrer`) apply identically regardless of who
authored the string, so no new XSS surface — `safe-markdown.test.tsx`'s
existing fixtures already cover this renderer, not just its assistant
call site. Outer bubble div keeps its border/background/padding and
`min-w-0 break-words [overflow-wrap:anywhere]`; `whitespace-pre-wrap` is
dropped since markdown's own paragraph/list/line-break handling now
owns that.

**Known behavior change, on purpose:** a user who literally types `*`,
`_`, or a lone backtick will now see it consumed as markdown formatting
instead of shown as-is — including retroactively on already-persisted
historical messages, since this reads `message.content` directly with
no "was this sent before/after the switch" flag stored anywhere.

### No new dependencies
`SafeMarkdown`/`react-markdown`/`remark-gfm`/`rehype-highlight` were
already dependencies (4a). No new package added for either fix.

### Files changed
- `apps/web/features/chat/hooks/use-chat-stream.ts`
- `apps/web/features/chat/components/message/message.tsx`

### DELETE list
None.

### How to verify
- CI: `type-check` / `lint` / `test` / `web-build` — no new jobs.
- Manual: start a long assistant response (ideally one with a fenced
  code block) and confirm the stream doesn't visibly decelerate near
  the end; confirm the full response still lands byte-for-byte (compare
  against Stop→resume-free full completion, or just read the final
  text). Confirm Stop mid-stream still marks the message `isPartial`
  with exactly the content received up to that point (no gap from the
  rAF buffer). Send a user message containing a numbered list, a `*bold*`
  word, and a fenced code block; confirm it renders formatted, not
  literal.
- Preview: `frontend-v2` Vercel preview (per D1's existing rules —
  dedicated test account, no real-money actions).

### Not verified (no `tsc`/`next build`/browser/network in this sandbox)
- No `node_modules` installed in this container and no network access,
  so neither of these changes has been typechecked or built here — only
  read/reasoned about and brace/structure-checked. Please run CI before
  merging.
- The rAF-batching behavior itself was not exercised against a live or
  mocked stream (no test file existed for `use-chat-stream.ts` before
  this change, and none was added — see "unresolved" below).
- Visual check of the user bubble's markdown spacing (`SafeMarkdown`'s
  default `p`/`li`/`code` margins against the bubble's existing
  `px-4 py-[13px]` padding) was reasoned from the CSS, not rendered.

### Unresolved / next steps
- Consider adding a `use-chat-stream.test.ts` that drives `send()` with
  a fake `runChatStream` to assert the rAF-coalescing behavior directly
  (chunk count in vs. dispatch count out, final content correctness,
  Stop-mid-buffer correctness) — flagged rather than built now, to keep
  this patch's diff scoped to the two reported bugs.
- If, after this, streaming still feels slow specifically on very long
  code blocks, the next lever is `rehypeHighlight`'s own re-tokenization
  cost, not React's re-render cost — e.g. skipping highlighting until a
  fenced block's closing ``` has actually streamed in, rather than
  highlighting an incomplete/unclosed block on every frame. Not done
  here since it wasn't confirmed to still be a problem after the rAF fix.

## Phase 4d Patch v9 — list bullets/numbers disappearing

### Root cause
`safe-markdown.tsx`'s `ul`/`ol` overrides never set `list-disc`/
`list-decimal`. Tailwind's preflight reset sets `list-style: none` on
every `ul`/`ol` globally; `li`'s `marker:text-primary` only styles
marker *color*, it doesn't turn a marker back on once preflight has
disabled it. Net effect: every list rendered through `SafeMarkdown` —
assistant messages too, this override is shared, not user-message-
specific — had its bullets/numbers invisible, just less noticed on the
assistant side before user messages started going through the same
renderer (Patch v8).

### Fix
`ul` → adds `list-disc`; `ol` → adds `list-decimal`. Nothing else
changed in either override.

### Files changed
- `apps/web/components/markdown/safe-markdown.tsx`

### DELETE list
None.

### How to verify
Send/receive a message containing a numbered list and a bulleted list;
confirm markers now render on both list types, in both a user bubble
and an assistant turn.

### Not verified
No `node_modules`/network in this sandbox — not typechecked or built,
reasoned from the Tailwind preflight/marker behavior directly.

## Phase 4d Patch v10 — Copy + Edit on user messages; copy/regenerate/feedback audit

### What was asked
1. Add Copy and Edit icons to a user message (same slot the assistant
   turn's meta row uses for its own actions), matching icon size.
2. Confirm the assistant's Copy icon is actually functional.
3. Audit Regenerate and the thumbs feedback icons; flag, don't fix yet.

### 1 — Copy + Edit on user messages (built)
- `chat-stream-reducer.ts`: new `EDIT_SEND` action. Same in-flight guard
  as `SEND`; additionally truncates the edited message and everything
  after it (old assistant reply included — the whole point of an edit)
  before appending the new user turn. No-ops if the edited id is no
  longer in `state.messages` (e.g. a race).
- `use-chat-stream.ts`: `send`'s body was refactored into two shared
  helpers (`makeCallbacks`, `buildRequestBody`) with no behavior change,
  then a new `edit(id, content)` reuses both — computes the truncated
  history + new user message itself (same reason `send` builds its own
  request array rather than reading the reducer's return value:
  reducers don't have one), dispatches `EDIT_SEND`, and starts a stream
  exactly like `send` does. No-ops during an in-flight stream or if `id`
  isn't found.
- `message.tsx`: user bubble gets a hover-revealed Copy + Edit icon pair
  (own small block, not an extension of `MessageActions` — that
  component's 4 icons are assistant-only concepts; see the inline
  comment for why this isn't "MessageActions with props toggled").
  Clicking Edit swaps the bubble for an inline auto-growing textarea in
  the same visual shell (border/radius/background unchanged) with
  Save/Cancel — Enter saves, Shift+Enter newlines, Escape cancels.
  Saving with empty or UNCHANGED text is treated as Cancel (no wasted
  provider call on a no-op edit). `editDisabled` (wired from
  ChatSession's existing `isBusy`) greys out the Edit icon while any
  stream is in flight.
- **`Message`/`MessageList`/`ChatSession` callback-identity fix, found
  while wiring this in:** `ChatSession` was passing brand-new inline
  arrow functions (`onCopy={() => {}}` etc.) as `MessageList`'s props on
  every render — which defeated `Message`'s own `React.memo` (Patch v8)
  for every row's callback props on every single streamed chunk, since
  a new function reference fails the memo comparator every time. All of
  `handleCopyMessage`/`handleRegenerate`/`handleFeedback`/
  `handleEditMessage` are now `useCallback`'d in `chat-view.tsx` with
  stable dependencies, restoring the actual point of Patch v8's memo.

**Open question, not resolved here — please confirm before this ships
past a preview:** editing only changes the CLIENT's in-memory transcript
(same truncate-and-resend pattern `retry()` already used). I found no
delete/truncate endpoint for persisted messages anywhere in
`apps/web/features/chat/lib` or `apps/api/src` — `runChatStream`'s own
contract (stream-reader.ts's header comment) is that a NEW send always
inserts new rows; it does not delete the old assistant reply (or any
rows after the edited turn) server-side. So after an edit + page
refresh, `useConversationMessages` will refetch from the DB and the
edited-away messages will likely reappear, out of sync with what the
client just showed. Either: (a) this is fine because nothing here is
DB-backed for undo purposes and a stale trailing turn is an acceptable
trade for now, or (b) `apps/api` needs a real
delete-messages-after-timestamp/id endpoint before this is a complete
feature. I did not build (b) — it's a backend contract change I
haven't seen a spec for, and guessing at one felt riskier than flagging
it. Flagging per plan rule 0.2/L3 territory (backend changes land on
`main` directly, not this branch) — your call on priority.

### 2 — Assistant Copy icon: confirmed broken, now fixed
`chat-view.tsx` had `onCopy={() => {}}` — a literal no-op, so the
assistant's copy button pressed the "copied ✓" check animation
(`message-actions.tsx`'s own local `useState`) but never actually put
anything on the clipboard. Now wired to
`navigator.clipboard.writeText(message.content)` via the same
`handleCopyMessage` used for the new user-message copy button.

### 3 — Regenerate and thumbs feedback: audited, NOT fixed, flagging per your instruction
- **Regenerate is only half-wired.** `chat-view.tsx` passes
  `onRegenerate={() => stream.retry()}`, but `retry()` in
  `use-chat-stream.ts` early-returns unless `state.status === "error"`
  (`if (state.status !== "error" || !lastSentRef.current) return;`).
  So the Regenerate icon under a NORMAL, successfully-completed
  assistant message does nothing at all — it only does something on the
  error-state's own retry affordance (`ErrorMessage`'s retry button,
  which hits the same code path and does work). A real "regenerate this
  reply" needs the same truncate-before-this-assistant-turn-and-resend
  shape `EDIT_SEND` now provides for user messages, just anchored to an
  assistant message id instead of a user one — straightforward to add
  as a sibling to `edit()`, deliberately not built now since you asked
  to flag rather than fix this round.
- **Thumbs up/down are a complete no-op, client AND server.**
  `chat-view.tsx` passes `onFeedback={() => {}}` (now `handleFeedback`,
  same empty body, kept explicit rather than silently wired to
  something half-working). `ChatMessage.feedback` is read from the DB
  row (`conversation-api.ts`'s `mapRow`), meaning a `feedback` column
  exists server-side, but there is no mutation endpoint anywhere in
  `apps/api/src` or `apps/web/features/chat/lib` that writes to it — I
  grepped the whole tree for `feedback` and the only other hit is the
  read path. Clicking either thumb changes nothing, persists nothing,
  and gives no visual feedback that anything happened (unlike Copy's
  copied-checkmark state) — a user has no way to tell whether it worked
  the first time they try it.

### Files changed
- `apps/web/features/chat/lib/chat-stream-reducer.ts`
- `apps/web/features/chat/hooks/use-chat-stream.ts`
- `apps/web/features/chat/components/message/message.tsx`
- `apps/web/features/chat/components/message/message-list.tsx`
- `apps/web/features/chat/components/chat-view.tsx`
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`

### DELETE list
None.

### How to verify
- Hover/tap a user message → Copy and Edit icons appear at the same
  size as the assistant's action icons.
- Copy on a user message and on an assistant message both actually put
  the text on the clipboard (paste somewhere to confirm) — previously
  only the user-message one would have worked at all, since assistant
  copy was the no-op.
- Edit a past user message with meaningful new content → old assistant
  reply (and anything after it) disappears, new user text appears, a
  fresh assistant reply streams in for it. Press Enter in the edit
  textarea to save, Shift+Enter for a newline, Escape to cancel, and
  saving with the text unchanged should just close edit mode with no
  network call.
- Try to open edit mode while a message is actively streaming elsewhere
  in the same conversation — icon should be visibly disabled.
- Regenerate on a normal (non-error) assistant message: confirm it
  still does nothing (this is the flagged, not-yet-fixed behavior —
  verifying the flag is accurate, not verifying a fix).
- Thumbs up/down: confirm no visible state change and nothing persisted
  after a refresh (same reason).
- CI: `type-check`/`lint`/`test`/`web-build` — no new jobs.

### Not verified
No `node_modules`/network in this sandbox — none of this was
typechecked, built, or run in a browser; reasoned from the existing
code and React/Tailwind semantics only. Please run CI and a manual pass
on the preview before merging.

### Unresolved / next steps (carried forward explicitly per your request)
1. Backend: does an edit (and, later, a real regenerate) need a
   delete-messages-after-X endpoint, or is the current
   resend-creates-new-rows-only behavior acceptable? (see the open
   question under §1 above.)
2. Regenerate: wire it the same way `edit()` now works, anchored to the
   assistant message id, once (1) above is settled — since regenerate
   has the identical "does the old row need deleting server-side"
   question.
3. Feedback: needs a real mutation endpoint (`apps/api`) before the UI
   is worth wiring at all — right now there is nowhere to send a
   thumbs-up/down to.

---

## Bugfix round — mobile Enter-to-send + markdown numbered-list report

### What was reported
1. On mobile, pressing the on-screen keyboard's Enter/return key sent
   the message instead of starting a new line. Desktop Enter-to-send /
   Shift+Enter-for-newline was working; only touch devices were affected
   (there is no way to type a multi-line message on a phone otherwise).
2. A pasted numbered list (1.–5., one item wrapping to a second,
   indented line) appeared to lose its numbers and render as
   unstructured text instead of a list.

### Root cause — (1), confirmed
`features/chat/lib/composer-keydown.ts`'s `shouldSendOnKeydown` only
guarded against Shift+Enter and mid-IME-composition Enter
(`isComposing` / Safari's `keyCode === 229`). A phone's on-screen
"return" key fires a perfectly ordinary, non-composing `Enter` keydown —
indistinguishable at the DOM level from a physical Enter — so neither
guard caught it, and every tap of the mobile return key sent the draft.

### Root cause — (2), NOT reproduced
Traced the exact pasted text through `remark-parse`/`micromark`
(the same CommonMark engine `react-markdown`+`remark-gfm` build on)
outside the app: it parses into a correct 5-item `<ol>` with the
wrapped second item's continuation line correctly attached, numbers
intact. `components/markdown/safe-markdown.tsx` already applies
`list-decimal`/`list-disc` + `ps-5` to `ol`/`ul` specifically because
Tailwind's preflight resets `list-style: none` globally — that fix is
already in this codebase (see that file's own `ol`/`ul`/`li` comment,
"this is what made bullets/numbers disappear entirely ... just less
noticed there"). No other code path mutates `message.content` before
it reaches `SafeMarkdown` (grepped for `replace(`/sanitizers under
`features/chat` and `components/markdown` — the only hit is an unrelated
UUID generator). I could not find a way to make this repo's current
code reproduce the loss of numbers. Not fixed because not found broken —
see "Not verified" below for what would settle it either way.

### What changed
- `features/chat/lib/composer-keydown.ts` — `shouldSendOnKeydown` takes
  an optional `isCoarsePointer` boolean; when true, Enter never sends
  (documented tradeoff: a touch+physical-keyboard 2-in-1 also loses
  Enter-to-send, since there's no DOM signal to tell the two apart).
  Defaults to `false`/unset so every existing desktop call and test is
  unchanged.
- `components/chat/composer.tsx` — `handleKeyDown` now reads
  `matchMedia("(pointer: coarse)")` live (SSR-guarded) and passes it
  through.
- `features/chat/lib/composer-keydown.test.ts` — 4 new cases covering
  coarse-pointer Enter, coarse-pointer Shift+Enter, and the two
  desktop-default cases (omitted / explicit `false`).

### Files changed
- `apps/web/features/chat/lib/composer-keydown.ts`
- `apps/web/components/chat/composer.tsx`
- `apps/web/features/chat/lib/composer-keydown.test.ts`

### DELETE list
None.

### How to verify
- **Mobile Enter fix** — on an actual phone (or Chrome DevTools device
  emulation, which sets `pointer: coarse`): tap the keyboard's
  return/Enter key while typing → inserts a newline, does not send.
  Tap the Send button → sends normally. On a real desktop browser
  (`pointer: fine`): Enter still sends, Shift+Enter still inserts a
  newline — unchanged.
- **Markdown numbering** — paste the exact 5-item numbered list from
  the report into the composer and send it: expect a rendered `<ol>`
  with visible `1.`–`5.` markers, item 2's wrapped line part of the
  same list item. If it still shows as unnumbered/flat text on an
  actual deployed preview, that's the one thing to send back to me —
  ideally with the browser/OS and a screenshot, since I could not
  reproduce it from the code alone (see below).
- `pnpm --filter web test` → `composer-keydown.test.ts` should show 10
  passing cases (6 existing + 4 new).
- CI: `type-check`/`lint`/`test`/`web-build` — no new jobs, no schema
  changes.

### Not verified
No `node_modules`/network in this sandbox for the actual `react-markdown`
+ `remark-gfm` + `rehype-highlight` pipeline or `pnpm`/`vitest` itself —
the list-rendering root-cause check used `remark-parse`+`micromark`
directly (present read-only in this sandbox as another tool's
dependency) as a stand-in for the same CommonMark grammar, not the
app's actual bundled pipeline, and the mobile fix was reasoned from
`matchMedia`/`KeyboardEvent` semantics, not exercised in a real mobile
browser. Please run CI and a real-device manual pass before merging.
If item (2) still reproduces on a real preview after this, the next
thing to check (that I could not check here) is whether the deployed
build actually contains the `list-decimal`/`list-disc` classes at all —
i.e. whether the preview the bug was seen on predates that earlier fix.

### Unresolved / next steps
1. If the numbered-list bug reproduces again, get the exact preview
   URL/commit it was seen on — if it's older than the `list-decimal`/
   `list-disc` fix already in `safe-markdown.tsx`, that alone explains
   it and no further code change is needed, just a redeploy.
2. The coarse-pointer heuristic's 2-in-1/iPad-with-keyboard tradeoff
   (documented above) is accepted as-is; revisit only if it's reported
   as an actual complaint, not preemptively.

---

## Phase 5.1 — Billing: wallet + redeem

### Summary
Built `/billing` (`(app)` group): `BalanceCard` (balance hero, low/zero
states) + `RedeemForm` (dash-auto-formatting input, paste button,
Turnstile, shape-only client check per Rule 5) in a new
`features/billing/` folder, wired to the existing frozen `POST
/api/redeem` route and `billing.getBalance` tRPC query. Flipped
`config/nav.ts`'s `billing` entry to `enabled: true` (page file now
exists, satisfying `nav.test.ts`'s enabled-implies-page-exists check).

Added polish beyond the plan's bare bullet list, per the session's
explicit ask: a two-cannon `canvas-confetti` burst
(`components/magicui/confetti.tsx`) fires once on a confirmed successful
redeem (Enter-to-submit or button), and `BalanceCard` gets an animated
`BorderBeam` ring (already in the repo since before this phase) in
warning/destructive colors when the balance is low/zero. Both respect
`prefers-reduced-motion`.

### Files changed
- `apps/web/features/billing/types.ts` (new)
- `apps/web/features/billing/lib/redeem-shape.ts` (new)
- `apps/web/features/billing/lib/redeem-shape.test.ts` (new)
- `apps/web/features/billing/hooks/use-redeem.ts` (new)
- `apps/web/features/billing/components/balance-card.tsx` (new)
- `apps/web/features/billing/components/redeem-form.tsx` (new)
- `apps/web/features/billing/index.tsx` (new)
- `apps/web/components/magicui/confetti.tsx` (new)
- `apps/web/app/[locale]/(app)/billing/page.tsx` (new)
- `apps/web/config/nav.ts` (edit: `billing.enabled` false → true)
- `apps/web/package.json` (edit: added `canvas-confetti` dependency,
  `@types/canvas-confetti` devDependency — install after merge)

### DELETE list
None.

### Frozen zone
Not touched. No edits under `app/api/**`, `server/**`, the listed
`lib/*.ts` files, `middleware.ts`, `i18n/request.ts`, `next.config.ts`,
`Dockerfile`, or anything outside `apps/web` (including `packages/config`
— `LOW_BALANCE_THRESHOLD` is imported from there, read-only, not
modified; a genuinely shared redeem-alphabet constant would need a
backend (B*) session to hoist it, since `packages/config` is out of
scope for a frontend session even though it predates the frozen-zone
rule's own drafting — see `redeem-shape.ts`'s header comment).

### No message-file changes
`messages/{ar,en}.json` already had complete `balance.*` and `redeem.*`
namespaces (including every error code the frozen service returns) from
an earlier phase — nothing added or renamed, so `i18n-parity` should
stay green as a pure regression check, not because this phase touched it.

### How to verify
- **CI:** `check` (type-check + lint) · `web-unit` (new
  `redeem-shape.test.ts`, 5+ cases) · `i18n-parity` (should be an
  unaffected regression pass) · `web-build`.
- **`nav.test.ts`:** must still pass now that `billing.enabled = true` —
  it asserts `app/[locale]/(app)/billing/page.tsx` exists, which it now
  does.
- **Preview, both locales (`/ar/billing`, `/en/billing`):**
  - Balance card shows the live balance; skeleton while loading.
  - Seed/force a low balance (< 10 credits) → card shows the amber
    `BorderBeam` ring + "Low Balance" badge + `lowMessage` text. Zero →
    red ring + "No Credits" + `zeroMessage`.
  - Redeem a valid, unused seeded code, submit via **Enter** in the
    input: side-cannon confetti fires once, success toast shows the
    exact credited amount, balance card updates without a page reload
    (no manual refresh).
  - Redeem the same code again (or an already-used one): translated
    `ALREADY_USED` error shown inline + as a toast, **no confetti**, code
    stays in the field for editing.
  - Rapid double-Enter / double-click submit on one code: only one
    network call fires (button disables on `isPending`), only one
    confetti burst, only one balance-refresh.
  - OS-level "reduce motion" enabled: no confetti, no BorderBeam pulse
    (theme.css's global override + `confetti.tsx`'s own check).
  - Sidebar: "Credits & Billing" now renders as a live link (not the
    disabled "soon" row) in both locales.
- **RTL:** Arabic layout — input direction stays LTR (codes are Latin
  characters, matching the code-block LTR convention elsewhere), paste
  button sits at the correct logical side, card grid reflows correctly.

### Not verified
No network/`node_modules` in this sandbox: `canvas-confetti`'s actual
bundle behavior, `pnpm install`, `tsc --noEmit`, `next build`, and
`vitest` itself were not run. In particular:
- I could not confirm `@trpc/react-query@^11` exposes `trpc.useUtils()`
  under that exact name in this repo's pinned minor version (v11's own
  history renamed `useContext` → `useUtils`; nothing in this codebase
  called either one yet, so there was no existing call site to confirm
  against). If CI's type-check fails on that call, it's a one-line
  rename to `trpc.useContext()`.
- `navigator.clipboard.readText()` in `handlePaste` requires a secure
  context and (on some browsers) a permission prompt — behavior on the
  actual Vercel preview domain over HTTPS should be fine, but I could
  not exercise it here.
- The `BorderBeam` `colorFrom`/`colorTo` props were passed
  `"var(--destructive)"`-style CSS var references (rather than resolved
  hex) so both light/dark themes pick up the right color automatically —
  this is a valid CSS value for the component's own custom-property
  usage as I read its source, but I did not render it to confirm.
- Per **0.2's D1 decision**, `frontend-v2` previews hit the production
  database — please redeem-test only with a dedicated test account and a
  purpose-generated test code batch, not a real user's code.

## Phase 5.2 — Billing: buy flow (Jaib + manual transfer), history, pricing

Built on top of 5.1's `features/billing/` folder (merged onto the
5.1-era `frontend-v2` state — no repo re-export happened between the two
phases in this session). Adds the package picker, the Jaib/manual-transfer
payment method dialog, the buyer's own claim list, transaction history
with client-side CSV export, and a public pricing table — all reading
from tRPC procedures that already existed and were unchanged
(`billing.listPackages`, `listPaymentMethods`, `submitManualPayment`,
`myManualPayments`, `getTransactions`, `models.list`).

### i18n gap found and fixed
`balance.types` (messages/{ar,en}.json) covered 6 of the real 7
`tx_type` enum values (`packages/db/src/schema/enums.ts`) — `refund` had
no translation key. Added `balance.types.refund` (and `.unknown`, for
`transaction-labels.ts`'s safe fallback on any future enum value the
frontend doesn't recognize yet) to both locale files. Confirmed full
key-set parity between `ar.json`/`en.json` after the edit (450 keys
each, zero one-sided keys) — `i18n-parity` should pass as a real check
this time, not a pass-through.

### Payment method fork
`paymentMethodTypeEnum` has exactly two values. `payment-method-dialog.tsx`
forks on `method.type`:
- `jaib_voucher` → instructions + `accountCode` panel, then a **scroll**
  (not a tab switch) to the always-visible 5.1 redeem box
  (`REDEEM_SECTION_ID`, exported from `features/billing/index.tsx`).
  Jaib buys a pre-issued code out-of-band; the existing redeem box
  already handles that.
- `manual_transfer` → the claim form (`submittedTxRef`, `senderPhone`,
  `senderName`, `notes` — **no screenshot field**, deferred), calling
  `billing.submitManualPayment`, then showing the server-generated
  `referenceCode` prominently as the transfer memo the buyer must use.

`submitManualPayment` already hard-rejects any method that isn't
`manual_transfer` server-side, so a client-side fork mistake here is a
confusing-UI bug at worst, never a money bug.

### Page layout change
`features/billing/index.tsx` (edited, not `page.tsx` — that file still
just renders `<BillingView />`, unchanged): the 5.1 `BalanceCard` +
`RedeemForm` grid stays at the top, always visible. Below it, a `Tabs`
(`Buy Credits` / `Pricing` / `History`) holds the new sections, so the
page doesn't become one long scroll.

### Payment method logos — no upload endpoint exists yet
`paymentMethods.logoUrl` is a nullable `text` column, validated as
`z.string().url()` by `admin.paymentMethods.create/update` — but there
is **no file-upload endpoint anywhere in this codebase** (grepped both
apps; infra/docker-compose mentions MinIO, nothing in `apps/web` or
`apps/api` calls it). There is also no admin UI yet for payment methods
at all (`/admin/payment-methods` is `enabled: false` in `config/nav.ts`,
Phase 8b). So today, adding a payment method's logo means:
1. Host the PNG/SVG somewhere with a stable HTTPS URL (a static host, a
   public bucket, even a CDN-fronted GitHub raw link short-term).
2. Paste that URL into `paymentMethods.logoUrl` directly (via a DB seed/
   migration, or `admin.paymentMethods.update` called from a script) —
   the tRPC procedure already accepts it, there's just no form for it.
`features/billing/components/payment-method-logo.tsx` renders the logo
if `logoUrl` is set, otherwise a neutral wallet-icon placeholder — never
a broken-image glyph. **Real fix**: a future backend session should add
an actual upload endpoint (MinIO, since it's already in the docker-compose
stack and unused) plus the Phase 8b admin form; until then this is a
manual, DB-level step, worth flagging to Fras before real Jaib/bank logos
are needed for launch.

### Magic UI
Not a new package.json dependency — Magic UI ships as copy-in component
source (`shadcn add @magicui/...`), and this repo already vendors four
components under `components/magicui/` from earlier phases
(`confetti.tsx`, `border-beam.tsx`, `magic-card.tsx`,
`shimmer-button.tsx`, `animated-shiny-text.tsx`). `package-picker.tsx`
reuses the existing `MagicCard` for the package cards' pointer-following
spotlight rather than adding a new component or a package install step.
If a future phase wants a Magic UI component not already vendored here,
the pattern is the same: copy the component source into
`components/magicui/`, not an npm install — `magic-card.tsx`'s own
header comment documents the adaptation notes (theme tokens,
`framer-motion` vs `motion` package) to follow for any new one.

### Files changed
- `apps/web/features/billing/types.ts` (edit — added
  `CreditPackageRow`/`PaymentMethodRow`/`PendingManualPaymentRow`/
  `TransactionRow`/`ManualPaymentSubmit*` local interfaces, mirroring DB
  row shapes rather than importing from outside `apps/web`, consistent
  with this file's own 5.1 header comment about a zero-import-into-
  frozen-zone policy for this feature folder)
- `apps/web/features/billing/lib/transaction-labels.ts` (new)
- `apps/web/features/billing/lib/transaction-labels.test.ts` (new)
- `apps/web/features/billing/hooks/use-manual-payment.ts` (new)
- `apps/web/features/billing/components/payment-method-logo.tsx` (new)
- `apps/web/features/billing/components/package-picker.tsx` (new)
- `apps/web/features/billing/components/pricing-table.tsx` (new)
- `apps/web/features/billing/components/payment-method-dialog.tsx` (new)
- `apps/web/features/billing/components/my-claims-list.tsx` (new)
- `apps/web/features/billing/components/transaction-history.tsx` (new)
- `apps/web/features/billing/components/buy-credits-section.tsx` (new)
- `apps/web/features/billing/index.tsx` (edit — Tabs layout, see above)
- `apps/web/messages/ar.json` / `en.json` (edit — new `billing.*`
  namespace + `balance.types.refund`/`.unknown` + a few `balance.*`
  table/pagination strings; see i18n gap note above)

### DELETE list
None.

### Frozen zone
Not touched. No edits under `app/api/**`, `server/**`, the listed
`lib/*.ts` files, `middleware.ts`, `i18n/request.ts`, `next.config.ts`,
`Dockerfile`, or anything outside `apps/web`. `app/[locale]/(app)/billing/page.tsx`
was **not** edited this phase — it already only renders `<BillingView />`
and that contract didn't need to change.

### How to verify
- **CI:** `check` · `web-unit` (new `transaction-labels.test.ts`, 6
  cases) · `i18n-parity` (now exercised by real new keys) · `web-build`.
- **Preview, both locales:**
  - `/billing`: redeem box unchanged at top; `Buy Credits` tab shows
    package cards (MagicCard spotlight on hover/pointer-move), best-value
    badge on the highest-credit package.
  - Pick a package → dialog lists payment methods with logo-or-placeholder
    icon → pick Jaib → instructions + account code with a working copy
    button → "Go to redeem" smooth-scrolls to the redeem box.
  - Pick manual transfer instead → fill the claim form → submit → success
    panel shows a reference code → claim appears in "My Claims" as
    Pending immediately (no refresh) → double-click submit doesn't create
    two rows client-side (button disables on `isPending`; server-side
    rate limits are the real guarantee, untouched).
  - `Pricing` tab: table renders every published+available model with
    its markup-applied credits/1K figures (server-computed, not
    recomputed here).
  - `History` tab: paginates via Prev/Next, every row has a real badge
    label including `refund` if you seed one, CSV export downloads the
    currently-loaded page only (filename says the offset range).
  - RTL: dialog fields default to LTR where the content is
    Latin/numeric (phone, tx ref), matching the code-block LTR
    convention elsewhere.

### Not verified
No network/`node_modules` in this sandbox — `pnpm install`, `tsc --noEmit`,
`next build`, `vitest`, and `eslint` were not run. Specifically:
- Could not confirm `trpc.billing.submitManualPayment.useMutation()`'s
  inferred input/output types line up byte-for-byte with the local
  `ManualPaymentSubmitInput`/`ManualPaymentSubmitApiResult` interfaces in
  `types.ts` — they're hand-mirrored from the router/schema source, not
  imported, so a real drift would only surface as a `tsc` structural-typing
  error, not a runtime one. If CI's type-check fails here, the fix is
  updating the interface to match, not the component.
- `navigator.clipboard.writeText()` in the Jaib panel's copy button has
  the same secure-context caveat 5.1 already flagged for
  `readText()` — should work fine on the HTTPS preview domain, not
  exercised here.
- Did not confirm `Table`'s default cell padding/wrapping looks right at
  narrow (mobile) widths with the pricing/history tables' 4 columns —
  `overflow-x-auto` wrapper is there as a safety net, not visually
  checked.
- `MagicCard`'s pointer-following spotlight requires an actual pointer
  device to see; keyboard/touch-only navigation still works (the whole
  card is a `<button>`), just without the visual flourish — not verified
  on an actual touch device.

## Phase 5.2 Patch v1 — `exactOptionalPropertyTypes` build failure fixed

**Symptom (from the actual Vercel/CI logs, not predicted):** `web:type-check`
and `web:build` both failed on `payment-method-dialog.tsx:196` —
`TS2379: ... not assignable ... with 'exactOptionalPropertyTypes: true'`.
The other 5.2 jobs (`Web Unit Tests`, `i18n Key Parity`, `API Tests`,
`Legal Docs In Sync`) passed; `E2E (Playwright)` also failed, almost
certainly as a downstream effect of the same build failure rather than a
separate bug (a broken `next build` means the app the E2E suite hits
doesn't come up) — worth confirming once the build is green again, but
not treated as a second issue here.

**Root cause:** this repo's `tsconfig.json` has `exactOptionalPropertyTypes: true`
(not visible from the schema/router source alone — only shows up at
`tsc` time, which this sandbox can't run, hence "Not verified" in the
original 5.2 delivery flagged exactly this class of risk, just not this
specific line). Under that flag, an optional property (`field?: string`)
may be *omitted* but never explicitly assigned `undefined` — `{ field:
undefined }` is a type error; only leaving the key out satisfies it. The
submit handler did `submittedTxRef: submittedTxRef.trim() || undefined`,
which explicitly assigns `undefined` for an empty field instead of
omitting the key.

**Fix:** new `features/billing/lib/manual-payment-input.ts` —
`buildManualPaymentInput()` only adds an optional key to the returned
object when the trimmed value is non-empty, so empty fields are absent
from the object entirely rather than present-with-`undefined`. Required
fields (`packageId`, `paymentMethodId`) are always included.
`payment-method-dialog.tsx`'s submit handler now calls this instead of
constructing the payload inline. Added
`features/billing/lib/manual-payment-input.test.ts` (3 cases: blank
fields omitted, trimmed non-blank fields included, required fields
always present) to `web-unit` so this exact class of regression fails
fast next time instead of only surfacing at `tsc`/build time.

### Files changed (this patch)
- `apps/web/features/billing/lib/manual-payment-input.ts` (new)
- `apps/web/features/billing/lib/manual-payment-input.test.ts` (new)
- `apps/web/features/billing/components/payment-method-dialog.tsx` (edit
  — submit handler now uses `buildManualPaymentInput()`; no behavior
  change for the buyer, same fields, same validation, same server call)

### Frozen zone
Not touched — same as the original 5.2 delivery.

### How to verify
- **CI:** `check`/`web:type-check` should now pass on this exact line —
  re-run the failed `Type-check & Lint` and `Web Build (next build)`
  jobs from the same PR/commit. `web-unit` gains 3 new passing cases.
- **Manual:** submit the manual-transfer claim form with every optional
  field left blank → succeeds, reference code shown (previously this
  exact case is what produced the `undefined` values that failed the
  build, so it's the one worth re-checking on the live preview once
  deployed). Then submit again with all fields filled → still succeeds,
  values reach the claim as before.

### Not verified
Still no `node_modules`/`tsc` in this sandbox — this fix is inferred
directly from the pasted compiler error text (exact file, line, and
message), not re-run locally. If another optional-field-assigned-
`undefined` pattern exists elsewhere in the 5.2 files (there wasn't one
in a re-read of the other new components — only this form has multiple
optional-from-empty-string fields), the same `tsc` flag would catch it
the same way; worth a full `pnpm type-check` before merging even after
this patch, since this fix addresses the one reported line, not a
project-wide sweep.

## Phase 5.2 Patch v2 — TabsList full-width layout fix

**Symptom:** on the `/billing` preview, the `Buy Credits / Pricing /
History` tab strip rendered stretched edge-to-edge with large gaps
between items (screenshot from user, mobile Chrome), instead of a
compact left/leading-aligned tab bar.

**Fix:** `apps/web/components/ui/tabs.tsx` — `TabsList` gets
`self-start` added alongside the existing `w-fit` (belt-and-suspenders
against the parent `Tabs`'s `flex flex-col` cross-axis stretch), and
`gap-0.5` tightened to `gap-1`. Shared primitive, so any other tab
usage in the app gets the same fix, not just billing.

### Files changed
- `apps/web/components/ui/tabs.tsx` (edit)

### DELETE list
None.

### Frozen zone
Not touched.

### How to verify
- **CI:** `web:type-check`, `web:build` — layout-only class change,
  no logic touched, no new test expected to fail or be needed.
- **Preview:** `/billing`, both mobile width and desktop width — tab
  strip (`Buy Credits`/`Pricing`/`History`) should hug its content on
  the leading edge (left in LTR, right in RTL) with tight spacing
  between items, not spread across the full container width.

### Not verified
No browser/`next build` in this sandbox — could not screenshot-diff
mobile vs. desktop myself. `self-start` + `w-fit` is the standard fix
for this exact flex-col stretch pattern, but if the preview still
shows stretching after this, the next thing to check (not yet
inspected) is whether `TabsPrimitive.List` from `@radix-ui/react-tabs`
renders any inline `style="width: ..."` of its own that would need an
explicit `!w-fit` override instead.

## B2 — Backend: user usage + index

**Goal:** tRPC procedures + REST export + DB index that Phase 6
(Dashboard & Usage Log) needs. Scoped to `type = 'usage_debit'`
transactions only (the rows with modelId/token metadata) — redeems,
admin credits, refunds, payments, referral bonuses are deliberately
excluded; that's the full ledger already served by
`billing.getTransactions` (5.2's History tab), not "usage."

### Files changed
- `packages/db/src/migrations/0009_usage_index.sql` (new) —
  `idx_transactions_type_date ON transactions(type, created_at DESC)`,
  per plan §7 F13.
- `apps/api/src/services/usage.service.ts` (new) — `getUsageSummary`,
  `getUsageTimeseries`, `getUsageByModel`, `listUsage` (keyset/cursor
  pagination on `(created_at, id)`, not offset — avoids skip/dup rows
  under concurrent writes), `listUsageForExport` (hard-capped 5,000
  rows, used by the REST route below). Every exported function takes
  `userId` as a required first argument and every query filters on it —
  no path returns another user's rows.
- `apps/api/src/routers/billing.router.ts` (edit) — added
  `usageSummary` / `usageTimeseries` / `usageByModel` / `listUsage`
  procedures, all `protectedProcedure`, all pass `ctx.user.id` (never
  client input) into usage.service.ts. Shared `usageRangeInput` (from/to/
  modelId) added.
- `apps/api/package.json` (edit) — new export map entry
  `"./services/usage"` (matches the existing `./services/redeem` /
  `./services/fraud` naming convention — key drops the `.service`
  suffix the filename has).
- `apps/web/app/api/usage/export/route.ts` (new) — REST `GET`, session
  auth via `auth.api.getSession` (same pattern as
  `apps/web/app/api/redeem/route.ts`), calls `listUsageForExport`
  directly (same service the trpc procedures use, so export can never
  diverge from what the UI shows), returns CSV with a
  `Content-Disposition: attachment` filename encoding the date range.
- `apps/api/src/services/usage.service.test.ts` (new) — Testcontainers,
  same pattern as `redeem.service.test.ts`. Covers: IDOR (4 tests — one
  per exported function, including a "foreign cursor" case where user A
  pages using user B's transaction id as `cursor` and must get an empty
  result, not an error or a leak), non-usage transaction types excluded,
  summary/avg/top-model aggregation correctness, keyset pagination
  (no skipped/duplicate rows across two pages), 90-day range clamp.

### DELETE list
None.

### Frozen zone
`app/api/usage/export/route.ts` is a new file under `apps/web/app/api/**`
— that path is frozen for *frontend* phase sessions, but B-sessions are
the explicitly sanctioned exception (§7: "separate small PRs to main");
`apps/web/app/api/redeem/route.ts` already established this exact
precedent (direct DB/service access, session-checked, outside any
frontend phase). No `server/**`, `middleware.ts`, `i18n/request.ts`, or
`next.config.ts` touched.

### How to verify
- **CI:** new `usage.service.test.ts` should run under whatever job runs
  `apps/api`'s existing `*.service.test.ts` files (Testcontainers, real
  Postgres) — confirm it's picked up by the same vitest config as
  `redeem.service.test.ts` (no new config needed if so). `web:type-check`
  should resolve `@ai-platform/api/services/usage` via the new
  `package.json` export.
- **Manual, against a seeded account with some chat usage:**
  - tRPC: `billing.usageSummary` / `usageTimeseries` / `usageByModel` /
    `listUsage` all return only that account's rows; `listUsage` with a
    `cursor` param pages correctly with no repeats.
  - REST: `GET /api/usage/export` (logged in, browser or `curl -b
    <session cookie>`) downloads a CSV; try `?from=2020-01-01` — either
    clamped to 90 days server-side or returns nothing beyond that window
    (this is the one behavior I could not exercise here — see below).
  - Confirm migration `0009` applies cleanly against a copy of the real
    DB (`IF NOT EXISTS`, so safe to run twice).

### Not verified
No `node_modules`/`tsc`/`vitest`/`next build` run in this sandbox —
same limitation as every prior phase here. Specifically:
- The new test file is written against the same Testcontainers/factory
  pattern as `redeem.service.test.ts`, but was not actually executed —
  if `drizzle-kit push` (which the test harness uses to build the schema
  fresh) or the SQL row-constructor comparison
  (`(created_at, id) < (cursorRow.createdAt, cursorRow.id)`) behaves
  differently than expected under Drizzle's `postgres-js` driver, the
  keyset-cursor tests are the ones most likely to need adjustment.
- Did not confirm `z.coerce.date()` (used for the `from`/`to` query
  params on the trpc procedures) is available in this repo's exact Zod
  version — Phase 1's stack doc says "Zod v4," which has it, but the
  lockfile wasn't checked.
- Did not confirm `exactOptionalPropertyTypes` (the flag that broke the
  5.2 build once already) has any issue with this file's optional
  `from`/`to`/`modelId`/`cursor` fields — they're all read via `?? `
  fallbacks or passed straight through from Zod's `.optional()` output,
  not manually assigned `undefined` the way the 5.2 bug did, but a real
  `tsc` run is the only way to be sure.
- `listUsageForExport`'s 5,000-row cap is a judgment call, not something
  from the plan text — worth confirming it's generous enough once real
  usage volume exists.

## B2 Patch v1 — `postgres-js` Date-binding crash in listUsage's cursor

**Symptom (from actual CI logs, not predicted):** `API Tests
(Testcontainers)` failed — `usage.service.test.ts > listUsage paginates
with a stable keyset cursor` — `TypeError: The "string" argument must be
of type string or an instance of Buffer or ArrayBuffer. Received an
instance of Date`, thrown inside `node_modules/postgres/src/bytes.js`
during bind. Everything else in the suite passed (86/87).

**Root cause:** `listUsage`'s keyset-cursor clause interpolated a plain
`Date` object (`cursorRow.createdAt`) directly into a raw `sql\`...\``
tuple. Drizzle's column-aware comparators (`gte`, `lte`, used elsewhere
in this same file) know how to serialize a `Date` for `postgres-js`;
a bare value inside a hand-written `sql` template does not get that
treatment and `postgres-js` fails trying to bind it.

**Fix:** `apps/api/src/services/usage.service.ts` — the cursor clause
now converts `cursorRow.createdAt` to `.toISOString()` and casts it
explicitly as `::timestamptz` in the SQL string, instead of passing the
`Date` object through.

### Files changed (this patch)
- `apps/api/src/services/usage.service.ts` (edit — `listUsage`'s cursor
  clause only; no other query in the file touched, since only this one
  builds a raw tuple comparison)

### Frozen zone
Not touched.

### How to verify
- **CI:** re-run `API Tests (Testcontainers)` — `usage.service.test.ts`
  should go from 1 failed / 86 passed to 87/87.
- No other job in the run needs re-checking — Type-check & Lint, Web
  Build, Web Unit Tests, i18n Key Parity, Legal Docs In Sync all already
  passed; E2E was still amber/running in the screenshot, unrelated to
  this file.

### Not verified
Still no local `vitest`/Postgres in this sandbox — this fix is inferred
directly from the pasted stack trace (exact error text + file), not
re-run here. If `postgres-js` still rejects the cast for any reason
(e.g. a driver version quirk), the fallback is switching the cursor
clause to two plain comparators (`or(lt(createdAt, x), and(eq(createdAt,
x), lt(id, y)))`) instead of a row-constructor tuple — more verbose,
but built entirely from column-aware operators with no raw-value
binding at all.

## Phase 5.2 Patch v3 — TabsList: full-width, evenly-distributed (reversal of v2)

**Change of direction, not a bug:** v2 made `TabsList` hug its content
(`w-fit`/`self-start`) to fix an unwanted full-width stretch. Explicit
follow-up ask: the opposite is actually wanted — the tab bar should span
the full width of its container with each tab taking equal space, not
sit compressed on the leading edge.

**Fix:** `apps/web/components/ui/tabs.tsx`:
- `TabsList`: `inline-flex w-fit self-start` → `flex w-full`.
- `TabsTrigger`: added `flex-1` so each of the three (or N) triggers
  splits the available width evenly, `justify-center` (already there)
  centers each label within its share.

Shared primitive — same as v2, this affects every `Tabs` consumer, not
just billing (still the only one today).

### Files changed
- `apps/web/components/ui/tabs.tsx` (edit)

### DELETE list
None.

### Frozen zone
Not touched.

### How to verify
- **CI:** `web:type-check`, `web:build` — layout-only class change.
- **Preview:** `/billing`, mobile and desktop — `Buy Credits / Pricing /
  History` should now span the full row width, each tab occupying equal
  space, label centered within its third.

### Not verified
No browser in this sandbox — same standing limitation as v1/v2 of this
fix, confirm on the live preview.

## Phase B2 — User usage + index (backend, before 6.1)

**Status: verified.** `usageSummary`, `usageTimeseries`, `usageByModel`,
`listUsage` all confirmed via manual `curl` against the `frontend-v2`
Vercel preview, using a real session cookie: correct, user-scoped JSON,
numbers reconciling against the raw `transactions` rows for the test
account (e.g. `nex-agi/nex-n2.5-pro:free` totals ≈245.5M micro-credits
across 8 requests matched the sum of the individual debit rows). CSV
export (`GET /api/usage/export`) also confirmed. GitHub Actions green on
`frontend-v2`.

**Non-issue noted during verification:** an early pass of `curl` against
`usageTimeseries` / `usageByModel` without a `?input=` query param
returned a 400 `"expected object, received undefined"` — this is correct
tRPC-over-HTTP behavior (a `GET` query's `z.object({...})` input, even
with every field optional, still needs an `input` query param; only
`listUsage`'s test command included one). Not a router bug — no code
changed for this. A later pass with `?input=%7B%22json%22%3A%7B%7D%7D`
succeeded for all three. A one-off `jq: parse error` on a subsequent
retry (stale cookie / shell quoting) also resolved itself on the next
attempt with no server-side change.

**Tracker:** B2 flipped from `[x] delivered, pending CI confirmation` to
`[x]` (fully verified) in `docs/FRONTEND_REBUILD_PLAN.md` §5.

---

## Phase 6.1 — Dashboard

**Build:** `apps/web/features/dashboard/**` (index, hooks, components,
lib, types), thin route `app/[locale]/(app)/dashboard/page.tsx`, `config/
nav.ts` dashboard entry flipped `enabled: false → true`, `dashboard`
message namespace added to both `messages/en.json` and `messages/ar.json`
(parity-checked locally: 471/471 keys both locales), `recharts@^2.13.0`
added to `apps/web/package.json` (D4 — no chart lib existed in the repo
before this phase).

Summary cards, spend-over-time chart, and per-model breakdown all read
from `billing.usageSummary` / `usageTimeseries` / `usageByModel` (B2),
batched into one HTTP request by the existing `httpBatchLink`. No
client-side re-bucketing of dates and no credit math outside
`formatCredits` (Rule 1) — the chart and table render the server's
numbers as-is.

### Deviation from the plan
None functionally. Added `features/dashboard/lib/period-range.test.ts` +
`period-range.ts` as a pure, directly-testable period→date-range helper —
the plan's 6.1 entry doesn't call this out explicitly, but Rule 10 /
phase-summary point 3 asked for a concrete verification step, and the
day-boundary math (local "today" vs. the server's UTC bucketing) is the
one place in this phase a silent off-by-one was plausible.

Also added `features/dashboard/types.ts` (local `inferRouterOutputs`
re-export) rather than adding a shared `RouterOutputs` helper to the
frozen `lib/trpc.ts` — no such helper existed in the repo before this
phase, and this session deliberately avoided touching the frozen zone to
add one repo-wide.

### Files changed
- `apps/web/features/dashboard/index.tsx` (new)
- `apps/web/features/dashboard/types.ts` (new)
- `apps/web/features/dashboard/hooks/use-dashboard-data.ts` (new)
- `apps/web/features/dashboard/lib/period-range.ts` (new)
- `apps/web/features/dashboard/lib/period-range.test.ts` (new)
- `apps/web/features/dashboard/components/period-switch.tsx` (new)
- `apps/web/features/dashboard/components/summary-cards.tsx` (new)
- `apps/web/features/dashboard/components/spend-chart.tsx` (new)
- `apps/web/features/dashboard/components/model-breakdown.tsx` (new)
- `apps/web/features/dashboard/components/dashboard-empty-state.tsx` (new)
- `apps/web/app/[locale]/(app)/dashboard/page.tsx` (new)
- `apps/web/config/nav.ts` (edit — `dashboard` entry `enabled: true`)
- `apps/web/messages/en.json` (edit — `dashboard` namespace added)
- `apps/web/messages/ar.json` (edit — `dashboard` namespace added)
- `apps/web/package.json` (edit — `recharts` dependency added)

### DELETE list
None.

### Frozen zone
Not touched. (`lib/trpc.ts`, `server/**`, `app/api/**` all untouched —
`features/dashboard/types.ts` reads `AppRouter`'s inferred output types
but does not modify any frozen file.)

### How to verify
- **CI:** `check` (type-check + lint), `web-build`, `web-unit` (new
  `period-range.test.ts`), `i18n-parity` — all four must stay green on
  `frontend-v2`.
- **Preview, `/ar/dashboard` and `/en/dashboard`, both themes:**
  - summary card totals match the `usageSummary` numbers already
    confirmed against B2
  - spend chart's per-day values match `usageTimeseries`
  - per-model table matches `usageByModel`, sorted by spend descending
  - period switch (7/30/90) refetches and updates all three sections
    together
  - a period with genuinely zero usage shows the empty state, not a
    broken chart
  - chart x-axis reads chronologically oldest→newest in both `ar` and
    `en`; in `ar` the chart's rendering direction (not the data order)
    is mirrored
  - sidebar "Dashboard" entry is now a real link, not a disabled "soon"
    row, in both locales

### Not verified
No browser or `pnpm install` in this sandbox (network disabled), so:
- `recharts`' `reversed` prop on `XAxis` combined with a raw ISO-string
  `dataKey`, and whether `orientation="top"` is the right way to mirror
  the axis in `ar` without also flipping the gridlines oddly, is
  **unverified** — this is the one part of 6.1 most likely to need a
  visual tweak on the actual RTL preview.
- Field names (`totalSpentMicroCredits`, `requestCount`, `inputTokens`,
  `outputTokens`, `avgCostMicroCredits`, `topModelId` / `date`,
  `spentMicroCredits`, `requestCount` / `modelId`, `spentMicroCredits`,
  `requestCount`, `inputTokens`, `outputTokens`) were cross-checked
  directly against `apps/api/src/services/usage.service.ts`'s return
  type declarations (not just your pasted `curl` output), so these
  should match `tsc` exactly. One nuance: `usageByModel`'s `modelId` is
  typed `string | null` in the service — `ModelBreakdown` renders it
  as-is (renders nothing for a null id, no crash) but doesn't special-
  case it with fallback text; flag if you'd rather it show something
  like "—" for that row.
- `next-intl`'s ICU plural syntax for `dashboard.period.days` (`{count,
  plural, one {# day} other {# days}}`) was not run through the actual
  `next-intl` formatter here — should render correctly (it's the
  standard documented syntax) but wasn't executed.

## Phase 6.2 — Usage log

**Build:** `apps/web/features/usage/**` (index, types, hooks, components,
lib), thin route `app/[locale]/(app)/usage/page.tsx`, `config/nav.ts`
`usage` entry flipped `enabled: false → true` (id/labelKey/icon already
existed as a placeholder since 6.1), `usage` message namespace added to
both `messages/en.json` and `messages/ar.json` (parity-checked locally —
509/509 keys both locales, flat-key diff empty both directions).

No backend PR was needed for this session: B2 (already `[x]`/verified
per this doc's own earlier entry) had already shipped `billing.listUsage`
(cursor-paginated, filterable by `modelId`/`from`/`to`) and
`GET /api/usage/export` ahead of when 6.1 consumed the rest of B2's
procedures, so 6.2 only had frontend work to do — matches what the
approved phase summary said before building.

Table pagination uses `trpc.billing.listUsage.useInfiniteQuery` (tRPC's
react-query integration supports this natively since the procedure's
input already has an optional `cursor` field and the output has
`nextCursor` — no hand-rolled offset/page-number state, which the phase
summary flagged as the specific risk to avoid given `listUsage`'s keyset
design). The model filter and CSV export button both read `models.list`
via a small local `use-model-catalog.ts`, a deliberate near-duplicate of
`features/dashboard/hooks/use-model-catalog.ts` (6.1) rather than a
cross-feature import — see that file's own comment for why (feature
folders are meant to be self-contained per §4 of the plan; the
underlying query is still deduped by React Query's cache either way).

### Deviation from the plan
None functionally. As flagged in the phase summary, added
`features/usage/lib/build-export-url.ts` + its vitest file as the one
piece of hand-written (non-server-echoed) logic in this phase — it's
also the mechanism that keeps the CSV export link and the on-screen
filtered table from disagreeing, since both `UsageFilterBar`'s export
`<a href>` and `useUsageLog`'s query input read the exact same `filters`
object owned by `UsageLogView`. Used a plain `<a href="/api/usage/export?...">`
rather than a JS-triggered blob download (contrast with 5.2's
`TransactionHistory`, which builds a client-side blob because
`billing.getTransactions` has no REST export route) — B2's route is a
real downloadable URL, so no client-side CSV construction was needed or
appropriate here.

Date range filtering uses two native `<input type="date">` fields rather
than a calendar-picker component — no such component exists in
`components/ui/` yet and the plan's own wording for 6.2 just says "date
range", so this avoids adding a new dependency for it; native date
inputs also get free RTL/locale rendering from the browser.

### Files changed
- `apps/web/features/usage/index.tsx` (new)
- `apps/web/features/usage/types.ts` (new)
- `apps/web/features/usage/hooks/use-usage-log.ts` (new)
- `apps/web/features/usage/hooks/use-model-catalog.ts` (new)
- `apps/web/features/usage/lib/build-export-url.ts` (new)
- `apps/web/features/usage/lib/build-export-url.test.ts` (new)
- `apps/web/features/usage/components/usage-filter-bar.tsx` (new)
- `apps/web/features/usage/components/usage-table.tsx` (new)
- `apps/web/features/usage/components/usage-row-detail.tsx` (new)
- `apps/web/features/usage/components/usage-empty-state.tsx` (new)
- `apps/web/app/[locale]/(app)/usage/page.tsx` (new)
- `apps/web/config/nav.ts` (edit — `usage` entry `enabled: true`)
- `apps/web/messages/en.json` (edit — `usage` namespace added)
- `apps/web/messages/ar.json` (edit — `usage` namespace added)

### DELETE list
None.

### Frozen zone
Not touched. `billing.listUsage` (apps/api) and
`app/api/usage/export/route.ts` were read but not edited — both were
already complete for this phase's needs (confirmed against
`usage.service.ts` and the B2 entry above before building).

### How to verify
- **CI:** `check` (type-check + lint), `web-build`, `web-unit` (new
  `build-export-url.test.ts`), `i18n-parity` — all four must stay green
  on `frontend-v2`.
- **Preview, `/ar/usage` and `/en/usage`, both themes:**
  - table rows match the same account's `usageByModel`/`usageSummary`
    figures already confirmed against B2
  - "Load more" appends the next cursor page with no skipped or
    duplicated rows across the boundary
  - model filter and date-range filters narrow the table; "Clear
    filters" only appears once a filter is set and resets to the
    unfiltered view
  - clicking/tapping (and Enter/Space on keyboard focus) a row opens the
    detail Sheet with matching model/date/cost/tokens/request id; Sheet
    slides from the correct physical side in `ar` vs `en`
  - the Export CSV link's downloaded file matches exactly the rows
    currently on screen under the active filters (the plan's literal
    "Done when" for 6.2)
  - sidebar "Usage" entry is now a real link, not a disabled "soon" row,
    in both locales

### Not verified
No browser, `pnpm install`, or database in this sandbox (network
disabled), so:
- `trpc.billing.listUsage.useInfiniteQuery`'s actual network behavior
  (correct `nextCursor` threading across pages, request batching via the
  existing `httpBatchLink`) was reasoned about from
  `apps/api/src/services/usage.service.ts`'s implementation and from
  `@trpc/react-query`'s documented `useInfiniteQuery` contract, not
  executed — this is the single riskiest unverified piece of this phase
  and the first thing to check on the live preview.
- Field names on `UsageListItem` (`id`, `createdAt`, `modelId`,
  `inputTokens`, `outputTokens`, `amount`, `requestId`) were cross-checked
  directly against `usage.service.ts`'s `UsageListItem`/`listUsage`
  return type, so these should match `tsc` exactly, but weren't run
  through the compiler here.
- `SheetContent`'s direction-aware slide side (used as-is, default
  `side="end"`) was confirmed by reading `components/ui/sheet.tsx`'s
  logic, not by opening the Sheet in an actual RTL browser.
- `next-intl`'s ICU plural/positional interpolation for
  `usage.table.tokensValue` (`"{input} in / {output} out"`) mirrors
  `dashboard.cards.tokensValue`'s already-shipped pattern exactly, so it
  should render the same way, but wasn't executed here either.

## Phase 7.1 — Settings: registry + profile + security

### Files (new/changed)
- `apps/web/components/ui/accordion.tsx` (new — shadcn/Radix primitive, not on the 1.2 list)
- `apps/web/features/settings/registry.ts` (new)
- `apps/web/features/settings/registry.test.ts` (new)
- `apps/web/features/settings/index.tsx` (new — `SettingsView`: Tabs ≥md / Accordion <md, both driven by `registry.ts`)
- `apps/web/features/settings/hooks/use-form-dirty-guard.ts` (new)
- `apps/web/features/settings/sections/profile/index.tsx` (new — `ProfileSection`)
- `apps/web/features/settings/sections/security/index.tsx` (new — `SecuritySection`)
- `apps/web/features/settings/sections/security/change-password-form.tsx` (new)
- `apps/web/features/settings/sections/security/two-factor-section.tsx` (new)
- `apps/web/features/settings/sections/security/active-sessions-list.tsx` (new)
- `apps/web/app/[locale]/(app)/settings/page.tsx` (new — thin route)
- `apps/web/config/nav.ts` (edit — `settings` entry `enabled: false → true`)
- `apps/web/messages/en.json` (edit — flat `settings.*` placeholder replaced with nested `settings.nav/profile/security.*`)
- `apps/web/messages/ar.json` (edit — same)
- `apps/web/package.json` (edit — two new deps, see below)

### DELETE list
None.

### Frozen zone
Not touched. Read but not edited: `apps/api/src/routers/user.router.ts`
(`getProfile`/`updateProfile`), `apps/web/lib/auth-client.ts` (confirmed
`twoFactor` plugin registered, `changePassword` exported), `apps/web/lib/
password-rules.ts`, `apps/web/lib/map-auth-error.ts`, and all three
`app/api/user/sessions*` routes — all already complete for this phase's
needs, confirmed by reading each file directly before building against it.

### Two new dependencies (declared in `package.json`, not installed/run here)
- `qrcode.react` (`^4.1.0`) — for `QRCodeSVG`, no `dangerouslySetInnerHTML`
  QR renderer for the 2FA `totpURI`. No QR primitive existed in the repo.
- `@radix-ui/react-accordion` (`^1.2.0`) — the primitive backing
  `components/ui/accordion.tsx`. **This one was missed in the original
  phase summary**, which only flagged `qrcode.react` as new; caught during
  packaging by checking `package.json` before assuming `@radix-ui/react-*`
  was already covered by the existing accordion animation keyframes
  (`tw-animate-css`, already installed, supplies `animate-accordion-up/
  down` — that part was fine; the Radix package itself was not installed).
  Same "add to package.json, verify in CI" precedent as `recharts` in 6.1.

### How to verify
- **CI:** `check`, `web-build`, `web-unit` (new `registry.test.ts`),
  `i18n-parity` — all four must stay green on `frontend-v2`. `web-build`
  will fail closed if either new dependency isn't actually resolvable
  once `pnpm install` runs in CI — that's the first thing to watch.
- **Preview, `/ar/settings` and `/en/settings`, both themes, 360px and desktop:**
  - display name update persists and reflects in the account menu
  - change password with a live session: succeeds with a valid new
    password, rejects a weak one with the mirrored client-side message
    before hitting the server
  - enable 2FA → QR renders → correct code verifies → backup codes shown
    exactly once → sign out → sign back in requires TOTP
  - disable 2FA requires password
  - revoke one non-current session logs that device out; "sign out all
    other devices" doesn't touch the current session; attempting to
    revoke the current session's own row is blocked (the route's
    existing 400)
  - dirty-form guard warns on a full reload/tab-close mid-edit (see "not
    verified" below for what it does NOT cover)
  - at 360px, Settings renders as an Accordion with "Profile" open by
    default; at desktop width, as Tabs; switching sections doesn't drop
    in-progress edits in the other section (both stay mounted)
  - sidebar "Settings" entry is now a real link, not a disabled "soon"
    row, in both locales

### Not verified
No browser, `pnpm install`, or database in this sandbox (network
disabled), so:
- The exact request/response field names of `authClient.twoFactor.enable`
  / `verifyTotp` / `disable` on this repo's pinned `better-auth` version —
  followed the plan's own assumed shape (`enable → QR → verify → backup
  codes`), cross-checked that `twoFactorClient()` is registered in
  `lib/auth-client.ts`, but never executed against the real client.
- `qrcode.react`'s `QRCodeSVG` actually rendering a `totpURI` string
  correctly — untested without a browser.
- `use-form-dirty-guard.ts`'s `beforeunload`-only scope: it does NOT
  intercept in-app Next.js route transitions (e.g. sidebar → another
  page while a form is dirty) — flagged in the hook's own comment as the
  one open gap, not half-built to cover it this session.
- The `change-password-form.tsx` actually shipped checks
  `status === 401 || 400 → t("errors.incorrectCurrent")` locally, rather
  than extending `map-auth-error.ts` with an `INVALID_PASSWORD` code as
  the phase summary originally described — functionally equivalent, but
  the two don't match verbatim; noted here rather than silently
  reconciled.
- Whether CI's `web-build` dummy-env-var job needs anything new for
  `qrcode.react` (pure client component, should need nothing) — not run.

## Phase 7.1 Patch v1 — `exactOptionalPropertyTypes` build failure + `twoFactor.enable()` union type, both caught by CI

Real CI run on `frontend-v2` (`Type-check & Lint` and `Web Build`, both
red) caught two things the sandbox's read-only checks couldn't:

- **`features/settings/index.tsx:38` (TS2375).** `sections[0]?.id` is
  `string | undefined`; `Tabs`/`Accordion`'s `defaultValue` prop is typed
  as plain `string` on this pinned version, and under
  `exactOptionalPropertyTypes: true` an explicit `undefined` can't flow
  into an optional prop even though omitting the prop entirely is legal.
  Same 5.2 Patch v1 category of bug. Fixed with `sections[0]?.id ?? ""`
  — safe in practice since `registry.test.ts` already asserts `profile`
  and `security` are always the visible set, so `sections[0]` is never
  actually absent at runtime.
- **`two-factor-section.tsx:81-82` (TS2339).** `authClient.twoFactor
  .enable()`'s return type is a discriminated union on `method`:
  `{ method: "otp" }` vs `{ method: "totp"; totpURI; backupCodes }`.
  The original code read `data.totpURI`/`data.backupCodes` unconditionally
  — compiles fine without the union narrowing under a looser tsconfig,
  fails here. This was exactly the "not verified without running code"
  risk flagged in the original 7.1 summary (exact response shape of
  `enable()`/`verifyTotp()`/`disable()` on the pinned `better-auth`
  version). Fixed by checking `data.method !== "totp"` and falling back
  to the generic error before reading either field — this flow is QR-only
  by design, so an `"otp"` response is treated as unexpected rather than
  silently rendering an empty QR code.

### Files changed
- `apps/web/features/settings/index.tsx`
- `apps/web/features/settings/sections/security/two-factor-section.tsx`

### How to verify
- CI: `Type-check & Lint` and `Web Build (next build)` must go green;
  the other four jobs (`API Tests`, `Web Unit Tests`, `i18n Key Parity`,
  `Legal Docs In Sync`) were already green and untouched by this patch.
- Preview: re-check the 2FA enable flow specifically — confirm the
  account's `twoFactor()` server plugin config (`lib/auth.ts`, frozen)
  always returns the `totp` branch for this app (no OTP-via-email/SMS
  method configured), so the new `!== "totp"` guard is dead code in
  practice rather than a silent failure path users actually hit.

### Not verified
Still no browser/`pnpm install` in this sandbox — this patch was written
directly against the CI log's error text and better-auth's documented
`twoFactor.enable()` union shape, not compiled locally. First real
confirmation is the next CI run.

## Phase 7.1 Patch v2 — two i18n keys silently dropped from the original messages patch

Root cause of the drop: the key-extraction step that built the original
`settings.*` messages patch used a greedy regex (`t\("([^"]+)".*`)
against lines containing more than one `t("...")` call. On a line like
`err?.status === 401 ? t("errors.incorrectPassword") : t("errors.generic")`,
greedy `.*` matching swallowed past the first call's closing quote, so
only the second, later key in the line was ever captured — the first
was silently lost. Two keys were missed this way:

- `settings.security.twoFactor.errors.incorrectPassword` — referenced
  in `two-factor-section.tsx` (enable-password and disable-password
  error paths)
- `settings.security.twoFactor.dialog.verifying` — referenced as the
  busy-state label on three buttons in the same file (TOTP verify,
  disable-password confirm)

Both are now added to `messages/en.json` and `messages/ar.json`. Also
re-checked every `t("...")` call across all five 7.1 files against both
locale files with a non-greedy extraction this time — no other keys
missing.

**This was found while investigating an "An error occurred. Please try
again." (Next.js's generic client-side error boundary, no stack trace)
reported on `/settings` in production.** It's a real, worth-fixing bug,
but it is very unlikely to be *this* crash: both missing keys are only
read inside the 2FA password-confirmation flow (button labels /
conditional error strings triggered after a user submits a password),
not on `/settings`'s initial render. **The actual cause of the reported
crash is still open** — a bare screenshot of that error page doesn't
carry the thrown error or stack trace, so nothing in this patch should
be read as "found and fixed" for that report. Next step: pull the
browser console error (or the Vercel Runtime Logs entry for the request
that 500'd, if this was a server-side throw) and paste the actual
message/stack in the next session.

### Files changed
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`

### How to verify
- CI: `i18n Key Parity` should already have been green (it only checks
  key parity between `en`/`ar`, not against code — this bug was a gap
  between code and messages, which that job cannot catch); confirm it's
  still green after this patch. `Web Build`/`Type-check & Lint` are
  unaffected (JSON-only change).
- Preview: exercise the 2FA enable flow with a deliberately wrong
  password, and the disable flow the same way, in both `en` and `ar` —
  confirm a real "Incorrect password." message renders instead of a
  crash or a raw `MISSING_MESSAGE` string.

### Not verified
The actual root cause of the `/settings` "An error occurred" report —
see above. Need the real error/stack trace to proceed.

## Phase 7.1 Patch v3 — root cause of the `/settings` crash found: `FormLabel` used outside `<FormField>`

Browser console (provided directly, not guessed at) gave the real error:
`Error: useFormField must be used within <FormField>`, thrown from
`components/ui/form.tsx`'s `useFormField()` (frozen? no — `components/
ui/form.tsx` is a NEW-ish shadcn primitive from an earlier phase, not
in the frozen list; read but not edited here). `FormLabel`, `FormControl`,
and `FormMessage` all call `useFormField()` internally, which reads
React context provided only by an enclosing `<FormField>` — using any
of them inside a bare `<FormItem>` with no `<FormField>` wrapper throws
immediately on mount, not conditionally.

Root cause: `sections/profile/index.tsx`'s **read-only email row**
used `<FormItem><FormLabel>…</FormLabel><Input readOnly /></FormItem>`
directly — never wrapped in `<FormField control name=…>` because email
isn't a react-hook-form-managed field (it's static display data from
`user.getProfile`, not part of `profileSchema`). Since `ProfileSection`
is always one of the two 7.1 sections mounted on `/settings` (both Tabs
and Accordion mount every visible section up front — see `index.tsx`'s
own comment), this threw on every single visit to the page, which is
exactly the "crashes immediately, no interaction needed" behavior
reported.

Fixed by dropping the Form primitives for that one static row and using
the plain `Label`/`Input` pair instead (same `components/ui/label.tsx`
primitive already used un-form-bound in `two-factor-section.tsx`'s
password/code inputs) — correct, since this field was never part of
the controlled form to begin with.

Audited the other two files that use these primitives
(`change-password-form.tsx`'s three fields) — all three are correctly
inside their own `<FormField>`; this was the one instance of the bug.

### Files changed
- `apps/web/features/settings/sections/profile/index.tsx`

### How to verify
- Preview `/settings` (both locales, both breakpoints): page must render
  without the error boundary; profile card shows the read-only email
  field styled the same as before (label + disabled input, no visual
  change intended).
- CI: `Type-check & Lint`, `Web Build` unaffected in kind (already
  green after Patch v1) but should be re-run to confirm nothing else
  regressed.

### Not verified
No browser in this sandbox — fixed directly from the pasted console
error and a direct read of `form.tsx`'s `useFormField` source (confirmed
the thrown message matches verbatim), not by reproducing and re-rendering
the page here. This should be the last item in this crash's chain, but
next preview load is the real confirmation.

## 2026-09-23 — Phase 7.2 (Preferences, API access, referral, privacy)

Landed `preferences`, `apiAccess`, `referral`, and `data` as the four
remaining settings sections `registry.ts` pre-declared (disabled) in
7.1. All four are additive UI wired to tRPC procedures already frozen
in the plan's Appendix C (`updateProfile`, `generateApiKey`,
`revokeApiKey`, `getApiKeyInfo`, `getReferralStats`) — no `apps/api`
router changes this session.

**Frozen-zone violation, resolved by splitting into its own backend PR:**
an earlier part of this same effort (across two sessions) edited
`apps/web/app/api/user/delete-account/route.ts` — inside `app/api/**`,
which §4's frozen-zone list and §7's "backend changes happen only in
§7 [backend-track] sessions" rule both cover — to add the 2FA-code gate
the plan's own 7.2 text calls for ("delete account (password confirm;
2FA code if enabled)"). That's a genuine contradiction between two
plan rules that should have been surfaced *before* building, not
after.

Rather than let it ride inside the `frontend-v2` branch (process
violation) or revert it outright (ships a delete-account flow that's
silently broken for every 2FA-enabled user), the route change has been
**pulled out of this phase's deliverable** and handed over as a
standalone backend change — same shape as a B-track PR (B1–B3), just
unscheduled in the plan's own list, closest in spirit to B4 ("Hardening
extras", open timeframe before 9.1). It targets `main` directly, gets
its own review/Testcontainers pass, and deploys via Render's normal
push-to-`main` path — independent of this frontend PR.

**This frontend PR does not depend on that backend PR landing first**,
in either order:
- `delete-account-dialog.tsx` only shows the 2FA step if the server
  actually returns `TWO_FACTOR_REQUIRED`. Deployed against the
  *current* (unpatched) route, a 2FA-enabled account simply deletes on
  password alone, same as every account did before this phase — no
  error, no crash, just the pre-existing (weaker) behavior until the
  backend PR ships.
- Once the backend PR lands, the already-shipped frontend code picks
  up the 2FA step automatically — no frontend redeploy needed.

The change itself (unaudited further here beyond the earlier review):
additive only, backward-compatible, checked via better-auth's own
`auth.api.verifyTOTP`/`verifyBackupCode` rather than a hand-rolled
comparison. See the separate backend deliverable's own notes for the
outstanding "not verified" caveat on the exact better-auth method
names.

**Preset list is genuinely just one entry today** (`AVAILABLE_PRESETS`
in `lib/theme-preset.ts` = `["gateway"]`), not the "3 presets" some
earlier planning docs implied. The Preferences UI renders whatever
that list contains, so a second/third preset lights up automatically
once its CSS exists — no further frontend wiring needed.

**`NEXT_PUBLIC_API_BASE_URL` is not yet set anywhere** (root
`.env.example`, Vercel project settings) — that file lives outside
`apps/web` and is therefore itself frozen for this session. Until it's
set, the API Access card shows a "not configured yet" state instead of
a curl example with a placeholder host. One-line addition for whoever
owns the root env files / Vercel project.

### Files changed (this frontend PR)
- `apps/web/features/settings/registry.ts` — 7.2 sections flipped to `visible: true`
- `apps/web/features/settings/registry.test.ts` — updated visible-sections assertion
- `apps/web/features/settings/sections/preferences/**` (new)
- `apps/web/features/settings/sections/api-access/**` (new)
- `apps/web/features/settings/sections/referral/**` (new) + `lib.test.ts` (new)
- `apps/web/features/settings/sections/data-privacy/**` (new), including
  `delete-account-logic.ts` (new — pure step-transition logic extracted
  out of `delete-account-dialog.tsx`, both for testability and to stop
  a local variable from shadowing the 2FA-code input state) +
  `delete-account-logic.test.ts` (new)
- `apps/web/lib/theme-preset.ts` (new), `apps/web/providers/theme-preset-sync.tsx` (new)
- `apps/web/app/[locale]/layout.tsx` — wired in `<ThemePresetSync />`, preset attribute is now switchable
- `apps/web/messages/{en,ar}.json` — added `settings.{preferences,apiAccess,referral,data}` (parity-checked: 123 leaf keys each side, zero mismatch)

**Not included in this frontend PR** (shipped separately, see above):
`apps/web/app/api/user/delete-account/route.ts`.

### Not verified
- No preview/browser available here: the actual `/settings` render
  with all six sections, the delete flow's password-only path (today's
  behavior against the unpatched route), RTL layout for the four new
  cards, and the "key shown once" behavior are all unexercised beyond
  static review.
- The 2FA-gated delete path specifically can't be exercised from this
  PR alone until the companion backend PR merges — see that PR's own
  verify list.

### How to verify
- CI: `Type-check & Lint`, `web-unit` (new tests: `registry.test.ts`,
  `referral/lib.test.ts`, `data-privacy/delete-account-logic.test.ts`),
  `i18n-parity`.
- Preview `/settings` (both locales, both breakpoints): all six
  sections render, tabs (desktop) and accordion (mobile) both show the
  four new cards.
- Preferences: switch language, theme, and default model; confirm the
  header's theme toggle and the chat model picker both reflect the
  change (shared state).
- API Access: generate a key → shown once → dialog closes → refetch
  shows only the prefix; revoke → key disappears; confirm the docs
  copy never says "OpenAI-compatible".
- Referral: copy the link, confirm the `?ref=` query param matches the
  account's code; numbers match a real referred/paid test account.
- Data & Privacy: export downloads a JSON file; delete-account
  completes with just a password (current route behavior for every
  account, 2FA-enabled or not, until the companion backend PR merges).
  Once that PR is live: re-verify that a 2FA throwaway account instead
  demands a valid TOTP or backup code and rejects an invalid one before
  completing.

## Phase 7.2 — build fix: exactOptionalPropertyTypes vs. Select `value`

**Symptom**: `frontend-v2` CI (`Type-check & Lint`) and the Vercel `next build`
both failed at the same spot:

```
features/settings/sections/preferences/index.tsx:173:14 — TS2375
Type '{ value: string | undefined; ... }' is not assignable to type
'{ value?: string; ... }' with 'exactOptionalPropertyTypes: true'.
```

**Cause**: Next.js's tsconfig auto-reconfiguration turned on
`exactOptionalPropertyTypes: true`. Under that flag, an optional prop
(`value?: string`) can be *omitted* but not explicitly passed as
`undefined` — TS treats those as different things. `defaultModel` is
`useState<string | undefined>`, and it was being spread straight into
`<Select value={defaultModel}>`, sending an explicit `undefined` on first
render (before `readLastModel()` resolves in the effect).

**Fix**: conditionally spread the `value` prop so it's fully omitted, not
`undefined`, when there's no default model yet:

```tsx
<Select
  {...(defaultModel !== undefined ? { value: defaultModel } : {})}
  onValueChange={(id) => { ... }}
>
```

No behavior change — `SelectValue placeholder` still renders when unset.

**File changed**: `apps/web/features/settings/sections/preferences/index.tsx`
(single-line fix at the `<Select>` for default model, ~line 173).

**Not independently verified**: no `node_modules` / network access in this
environment to run `tsc --noEmit` or `next build` locally. Recommend a full
`pnpm --filter @ai-platform/web type-check` pass in CI as real verification.

**Untouched**: `E2E (Playwright)` was also red in the same GitHub Actions
run, but no log was provided for it — separate issue, not investigated.

## Phase 8a — Admin shell + reusable DataTable

**Built:**
- `components/data-table/{types,data-table-url-state,use-data-table-url-state,data-table}` —
  generic, server-driven DataTable: search + column-visibility + sortable
  headers + pagination, all synced to URL search params (namespaced by an
  optional `prefix` so more than one table can live on a page later).
  URL parse/serialize/sort-toggle logic is split into pure functions
  (`data-table-url-state.ts`) with full vitest coverage; the
  `next/navigation`-dependent hook itself is a thin wrapper this sandbox
  cannot unit-test (same constraint noted throughout this file for any
  `useRouter`/`useSearchParams` code).
- `components/shared/confirm-dialog.tsx` — controlled (not
  Radix-auto-closing) confirm dialog with an optional "type X to confirm"
  gate, for 8b's money/destructive actions. Built on the plain `Dialog`
  primitive to match `delete-account-dialog.tsx`'s (7.2) existing
  precedent, not `alert-dialog.tsx` (unused elsewhere in this codebase).
- `features/admin/overview/*` — replaces the 2.1 placeholder body at
  `/admin` with a live "recent users" DataTable preview against the real
  `admin.listUsers` procedure, read-only (no row actions yet — that's
  8b). This is what makes 8a's "table survives reload with filters kept
  in the URL" checkable on the actual preview instead of only in vitest.

**Plan-vs-code note:** 8a's plan text says the DataTable supports
"server pagination/sort/filter via URL search params." `admin.listUsers`
(the only admin list procedure that exists at this point) only accepts
`{ limit, offset, search }` — no `sortBy`/`sortDir`. `DataTable`'s `sort`
prop is fully implemented and unit-tested, but the admin overview page
does not pass it (would be a fake control with nothing to sort by
server-side). 8b/8c can wire `sort` once a procedure actually accepts a
sort column; no plan or code change needed to enable it later — it's an
unused prop today, not a missing feature.

**Not independently verified** (no `node_modules`/network in this
environment, same constraint as 7.2's fix): the vitest file for
`data-table-url-state.ts` was written to what I'm confident is correct
Vitest/TS, but not actually executed here. `next build`/`tsc` should be
the real check, same as every prior phase's note in this file.

**Tracker:** NOT ticking `8a` in `docs/FRONTEND_REBUILD_PLAN.md` myself —
per the plan's own rule 4, a session is only done once CI is green on
`frontend-v2` and the preview's "Done when" checklist passes. Tick it
once that's confirmed.

---

## Phase 8b (in progress — batch 1 of 2)

This entry covers only the first delivered slice: the `admin.listUsers`
search fix and the `/admin/users` list + detail pages. Codes, packages,
payment methods, manual payments, nav/messages for those, tests, e2e,
and the tracker tick land in batch 2 and will extend this entry rather
than replace it.

**Plan-vs-code resolutions (all three approved by the person, "best for
the project" on each):**
1. **`admin.listUsers` search fixed for real**, not dropped. Added an
   `ilike` on `email` OR `displayName` in `apps/api/src/routers/
   admin.router.ts` — the one scoped edit to the otherwise-frozen API in
   this phase. Consequence: 8a's overview "recent users" preview table
   now has a genuinely working search box, so it was NOT stripped as
   the phase summary's default proposed — stripping it would now be
   removing working functionality.
2. CRUD = create/edit/activate-deactivate (batch 2; no delete procedure
   exists for packages/payment methods). Claims queue gets status tabs
   + a client-side filter on the loaded page only, labeled as such
   (batch 2).
3. Preview approve/adjust actions hit the production DB — test accounts
   only on preview; this is the warning line satisfying that note.

**What's new in this batch:**
- `apps/api/src/routers/admin.router.ts` — `listUsers` now filters by
  `search` via `ilike(email) OR ilike(displayName)`. No index added;
  fine at current scale, flagged in-code for a future pg_trgm index if
  the table grows.
- `lib/format.ts` — `microToCredits()`, the inverse of `formatCredits`'s
  division, as a plain number for pre-filling editable amount fields.
  Needed now for `adjustCredits`'s amount input; will be reused by
  batch 2's package-edit form (Rule 1: one conversion helper, not
  inline math at each call site).
- `components/shared/confirm-dialog.tsx` — added an optional `children`
  slot (rendered between `description` and the typed-confirmation
  input) so a dialog can carry a small form, not just a target string.
  Additive/optional prop — no change to any 8a caller's behavior.
- `features/admin/users/*` + `app/.../admin/users/[[id]]` — the real
  users list (DataTable, row click → detail) and detail page (suspend/
  reactivate, adjust credits), both via `ConfirmDialog`.
  - Self-suspend is hidden (not just disabled) on the detail page when
    the signed-in admin views their own account — the server still
    allows it (point 4 of the phase summary), this is a UI-only guard.
  - `adjustCredits` has no server-side idempotency key/cap (point 4).
    Client-side mitigation, in `use-adjust-credits.ts`: typed
    confirmation of the exact amount, PLUS a synchronous `useRef` lock
    that blocks a second `mutate` call fired before React's `isPending`
    state has re-rendered (a fast double-click race that `isPending`
    alone doesn't close). This is still a UX-layer guard, not a
    substitute for a real idempotency key — a follow-up for whoever
    next touches this API router.
- `config/nav.ts` — `adminUsers` flipped to `enabled: true`.
- `messages/{en,ar}.json` — new `admin.usersPage` namespace (parity
  checked: no key diff either direction).

**Not independently verified** (same standing constraint as every
phase in this file — no `node_modules`/network/DB here): the `ilike`
query, all new components, and the message JSON were written and
cross-checked against the existing schema/types/conventions by reading
the repo, not by running `tsc`, vitest, `next build`, or against a real
DB. `check`, `web-build`, and `i18n-parity` in CI are the real
verifiers for this batch.

**Tracker:** not touching `8b`'s tick — batch 2 finishes the phase.

---

## Phase 8b, batch 2 (closes the phase)

Codes, packages, payment methods, manual payments — the remaining four
money-ops screens. No `apps/api` changes this batch: `admin.router.ts`
already had every procedure these screens call (`generateCodes`,
`listCodeBatches`, `getBatchCodes`, `revokeCode`, `revokeCodeBatch`,
`listPackages`/`createPackage`/`updatePackage`,
`listPaymentMethods`/`createPaymentMethod`/`updatePaymentMethod`,
`listManualPayments`/`approveManualPayment`/`rejectManualPayment`) —
verified by reading the router, not assumed.

**What's new in this batch:**
- `lib/csv.ts` — client-side CSV builder shared by the codes screens.
  Formula-injection guard (a cell starting with `=+-@`/tab/CR gets a
  leading `'`) + RFC 4180 quoting + UTF-8 BOM (Arabic labels in Excel
  on Windows). The existing 5.2 billing CSV export does **not** have
  this guard — a known gap, left alone as out of this phase's scope,
  not fixed here.
- `features/admin/codes/*` — batches list (aggregates only) + generate
  dialog (optional package/payment-method link) + batch detail (table +
  CSV export + print sheet + revoke single/batch). `getBatchCodes` and
  the generate mutation's result both use `gcTime: 0` — codes are
  bearer credentials, so a batch of redeemable codes never sits in the
  query cache once nothing's subscribed to it. Print sheet: added
  `print:hidden` to `AppShell`'s sidebar and header (the only two
  pieces of shell chrome); the batch-detail component hides its own
  screen-only controls/table the same way and shows a print-only card
  grid instead.
- `features/admin/packages/*` — list + create/edit/activate-deactivate
  (no delete procedure). Edit pre-fills the credits field via batch 1's
  `microToCredits()`.
- `features/admin/payment-methods/*` — **hooks only were in the
  batch-2 handoff; the feature component (`index.tsx`) did not exist.**
  Built here from scratch, deliberately mirroring `../packages/index.tsx`
  (same create/edit/activate-deactivate shape) so the two screens stay
  consistent. `type` (jaib_voucher / manual_transfer) is disabled on
  edit — `updatePaymentMethod`'s input schema has no `type` field, so
  an edit genuinely cannot change it; the form reflects that rather
  than silently dropping the value.
- `features/admin/manual-payments/*` — the claims queue. Status tabs
  are real server refetches (`listManualPayments({ status, limit: 100
  })`); the search box filters ONLY the up-to-100 already-loaded rows
  for the current tab — labeled `filterNote` in the UI as exactly that,
  since there's no server-side search or total count to search against
  (point 2 of the original phase summary). Approve/reject both go
  through `ConfirmDialog`; approve moves real balance
  (`approveManualPayment` → `creditBalance`), reject requires a reason.
- `app/[locale]/(admin)/admin/{codes,codes/[batchId],packages,
  payment-methods,manual-payments}/page.tsx` — thin server pages, same
  shape as every other admin route (`SectionPage` + a `getTranslations`
  title/description).
- `config/nav.ts` — `adminCodes`, `adminPackages`,
  `adminPaymentMethods`, `adminManualPayments` all flipped to
  `enabled: true`. `nav.test.ts`'s rule (no enabled entry without a
  page file) is satisfied by the five page files above.
- `messages/{en,ar}.json` — four new namespaces:
  `admin.codesPage`, `admin.packagesPage`, `admin.paymentMethodsPage`,
  `admin.manualPaymentsPage`. Key parity checked both directions by
  script (flattened key-set diff, en vs ar) — no gap either way.
- `lib/csv.test.ts` — new; covers the formula-injection guard (all six
  risky prefixes), RFC 4180 quoting/escaping, null/undefined cells, and
  CRLF joins. Pure function, fully covered.
- `e2e/admin-money.spec.ts` — new; smoke-only (login as seeded admin,
  each of the four routes renders, primary dialog opens). Deliberately
  does **not** click Approve/Reject/Revoke on any row — those mutate
  real balance/codes and there's no seeded fixture data for these
  screens in `packages/db/src/seed.ts` to safely act on. A full CRUD
  e2e pass is a follow-up once seed data exists for packages/payment
  methods/claims.

**⚠️ Preview warning (carried over, now actually relevant):** the
approve/reject buttons on `/admin/manual-payments` and the revoke
buttons on `/admin/codes/[batchId]` call real, unguarded mutations
against whatever DB the preview environment points at. Test accounts /
scratch data only until this phase gets a staging DB of its own.

**Not independently verified:** no `tsc`, vitest, `next build`, or
Playwright run here. Every hook against `admin.router.ts` was
cross-checked line-by-line against the actual procedure input schemas
(field names, enums, return shapes) by reading the router, not by
compiling against it — see the delivery message for the specific
procedures checked. The payment-methods feature component is the one
piece with no batch-2-author precedent to check against at all (it
didn't exist); treat it as the least-verified file in this delivery
and look at it first in review.

**DELETE list:** none. Nothing in this batch replaces or obsoletes a
previously-shipped file.

**Tracker:** Phase 8b is done as of this batch — flip its tracker
entry in the phase index the next time that file is touched (not
edited here, to keep this diff scoped to the phase's own files).


---

## Phase 8b — CI green-up (post-delivery, from the failing-job logs)

8b's features were already in the repo; CI on `frontend-v2` was red on
`check`, `web-build` and `E2E (Playwright)`. Root causes, read from the
job logs (screenshots), fixed without touching the frozen zone:

| Log error | Cause | Fix |
|---|---|---|
| `features/admin/packages/index.tsx(139,81)`, `(140,99)`; `payment-methods/index.tsx(144,81)`, `(145,102)` — TS2345 `createdAt: string` vs `Date` | Rows typed with `CreditPackage` / `PaymentMethod` from `@ai-platform/db` (`Date`), but tRPC has no transformer so the client gets ISO strings | New `types.ts` in each feature: `inferRouterOutputs<AppRouter>["admin"][...][number]` (same pattern as `features/dashboard/types.ts`); `index.tsx` uses `PackageRow` / `PaymentMethodRow` |
| `features/admin/users/detail.tsx(187,8)`, `(214,8)` — TS2375 | `ConfirmDialog.requireTypedConfirmation?:` did not accept `undefined` under `exactOptionalPropertyTypes` | Prop types widened with `\| undefined` (`requireTypedConfirmation`, `isPending`, `destructive`); no behaviour change |
| `features/admin/codes/index.tsx(55,46)` — TS2379 | `GenerateCodesInput.packageId/paymentMethodId/expiresAt` optional but caller passes `undefined` | Widened with `\| undefined` in `use-generate-codes.ts` |
| `components/magicui/border-beam.tsx(98,8)`, `shiny-button.tsx(51,6)` — TS2375 (`animate` incompatible) | `animate={reduced ? undefined : …}` (and `transition`, `whileTap`) pass `undefined` explicitly | Conditional spread `{...(reduced ? {} : {animate, transition, …})}` — props omitted under reduced motion, same runtime behaviour |
| `components/magicui/lens.tsx(139,14)` — TS2345 `string \| undefined` | `order[nextIndex]` under `noUncheckedIndexedAccess` | `if (nextValue === undefined) return;` before `select()` |
| `features/landing/index.tsx` — `Module not found: ./components/models-section` (web-build, e2e build step, type-check TS2307) | **The file was missing from the repo** (imported, referenced by `e2e/landing.spec.ts` as `#models`, but never delivered) | Recreated `models-section.tsx` (server component, `id="models"`, `landing.modelsHeading`, wraps `ModelsTable`); new `landing.noModelsAvailable` key in ar + en |

**Also changed (approved add-on):** the adjust-credits dialog now requires
a non-empty reason (plan 8b: "mandatory reason") — `ConfirmDialog` gained an
optional `confirmDisabled` prop, and the Confirm button stays disabled until
amount AND reason are valid. The gate rule is now a pure function,
`components/shared/confirm-gate.ts`, with `confirm-gate.test.ts` covering:
pending blocks, not-ready blocks, typed text must match exactly
(case-sensitive), and a typed match never overrides pending/not-ready.

**Not verified (no node_modules/network here):** `tsc`, vitest, `next build`
and Playwright were not run. I could only syntax-check the changed files with
a global `tsc` and confirm both message JSONs still parse and stay in key
parity. The Type-check screenshots showed every error up to `payment-methods
(145,102)` and then the `detail.tsx`/landing ones; if CI shows an error not in
the table above, paste it. Whether `packages/index.tsx` compiles cleanly
against the inferred row type (e.g. `pkg.priceUsdEquivalent` is a string)
is inferred from the router, not compiled.

**Standing warning (D1):** preview uses the production DB — test accounts
only for approve/reject/revoke/adjust.

**Tracker:** `8b` (and the stale 6.1–8a rows) NOT ticked by me — tick after CI
is green on `frontend-v2` and the preview checks below pass.

## Phase 8b — CI green-up round 2 (lint: physical-direction classes)

The round-1 fixes worked: the `Type check` step in `Type-check & Lint` is now
green, and `next build` gets past "Compiled successfully". What remained was
the Rule 2 ESLint ban (`no-restricted-syntax`), which `next lint` (inside the
Lint step, Web Build and E2E's build) enforces:

- `components/magicui/interactive-hover-button.tsx` (65:11): `left-1` /
  `group-hover:left-0` -> `start-1` / `group-hover:start-0`. While there, the
  slide/arrow animation was direction-implying in RTL, so added `rtl:`
  variants (`rtl:group-hover:-translate-x-3` on the label, mirrored arrow
  offset and `rtl:-scale-x-100` on the arrow) per Rule 2's "direction icons
  flip in RTL".
- `components/magicui/lens.tsx` (229:9): `text-left` -> `text-start`.

Both files are copied Magic UI components (round 1 also touched them for the
`exactOptionalPropertyTypes` errors), which is why they slipped past the
ban. I re-ran the ESLint regex from `.eslintrc.json` over every string
literal in `apps/web/**/*.tsx` (excluding tests/dev pages): zero hits left.
That is a regex approximation of the rule, not ESLint itself.

**Not verified:** no lint/build/Playwright run here. The `rtl:` hover
animation is unchecked visually — look at it once on `/ar` if that button is
used on a page you care about.

## Phase 8b / 5.1 — two bugs found on the green preview

**1. Redeem: valid code lost its "1" (`JUHP-XFSR-J936-EE19` -> `...EE9`).**
Root cause: `formatRedeemInput` (5.1) filtered EVERY character through the
31-char body alphabet (no 0/O/1/I/L). The last group is the checksum, built
server-side as `hmac.digest("hex").slice(0, 4).toUpperCase()` — i.e. hex
0-9A-F — so roughly half of all real codes contain a 0 or 1 in that group
and could not be typed or pasted. My 5.1 implementation was wrong: I treated
"4 groups of 4" as one alphabet. Fix (`features/billing/lib/redeem-shape.ts`):
position-aware filter — first 12 chars body alphabet, last 4 hex — and the
shape regex matches. Still shape-only, checksum stays server-side (Rule 5).
Tests updated/added in `redeem-shape.test.ts` (including this exact code).
Note: the old 5.1 test "first 16 chars of the alphabet round-trip" encoded
the wrong assumption and was replaced by a first-12 version.

**2. Payment method: Logo URL was effectively required.**
`admin.createPaymentMethod`/`updatePaymentMethod` take
`logoUrl: z.string().url().max(2048).optional()`; the form sent `""`, which
fails `.url()` (the raw zod JSON the admin saw). Fix: blank -> key omitted;
non-blank must be an http(s) URL, checked client-side with an inline
message (`features/admin/payment-methods/lib/logo-url.ts` + tests; new i18n
keys `form.logoUrlHint/HintEdit/Invalid`, ar+en).
Known limit (needs a backend change, not done): on EDIT, emptying the field
keeps the current logo — the update schema has no way to clear it
(`.optional()`, not `.nullable()`); the form says so.
**Logo upload from device: NOT built** — see the delivery message; there is
no storage in the repo and every option touches the frozen zone / backend.

Verified by actually executing the pure functions in Node (type-stripped),
not by vitest/tsc/next build, which I can't run here.

## Backend B3 — Admin logs + audit

**Built:** `admin-logs.service.ts` (`listUsageLogs`, `listAuditLogs`, both
keyset-paginated on `(created_at, id)`, same pattern as B2's
`usage.service.ts`) and two new `adminProcedure`s in `admin.router.ts`.
Unlike `usage.service.ts`, `listUsageLogs` is deliberately **admin-wide** —
no implicit `userId` scope — since the whole point is a cross-user view;
`admin-logs.service.test.ts` asserts that directly (one call surfaces two
different users' rows), which is the mirror image of B2's IDOR test.
`apps/web/app/api/admin/logs/route.ts` (the old unfiltered-200-rows REST
route) is untouched — 8c switches the UI to the new procedure; removing the
REST route is a 9.3 cleanup item, not this one.

**Migration `0010_audit_logs_index.sql`:** `audit_logs` had no index beyond
its PK; added `(admin_id, created_at desc)` and `(action, created_at desc)`
for the new filtered/sorted admin reads — same reasoning as B2's
`idx_transactions_type_date` for F13.

**Migration-runner correction (important — read before running anything):**
I initially told the user `0001`–`0009` being absent from
`migrations/meta/_journal.json` was a bug and offered to fold them into
drizzle-kit's own journal. That was wrong and I corrected it in the same
turn before building. Every one of those files' own header says "Execute
with: psql $DATABASE_URL < ..." and every statement in them is written
idempotent (`IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`,
same-value `UPDATE`s) — that's a deliberate second track, not drizzle-kit's
migration history. `0000` is the only file drizzle-kit owns and the journal
is correct as-is; I left it untouched.

What I built instead: `packages/db/src/scripts/run-manual-migrations.ts`
(`pnpm --filter @ai-platform/db db:migrate:manual`, `--dry-run` supported).
It creates a small `_manual_migrations(filename, hash, applied_at)`
tracking table, finds the current head (the last recorded file), and
applies only what's newer, each in its own transaction, then records it.
It also hash-checks every *already-recorded* file against what's on disk
and refuses to run if one has been hand-edited after the fact (forces a new
migration file instead of mutating an applied one). First run against an
existing database (e.g. production, where `0001`–`0009` were applied by
hand via `psql` and never recorded anywhere) is safe *because* those files
are idempotent — it re-applies them as no-ops and then records them, so
every run after that only touches what's actually new (right now, just
`0010`). This does not change how `0000`/`db:migrate` works.

**Tests:** `admin-logs.service.test.ts`, Testcontainers, mirrors
`usage.service.test.ts`'s setup (dynamic import after `startTestDb()`).
Covers: the admin-wide/two-users property, `userId`/`modelId`/`adminId`/
`action`/`targetType` filters, `usage_debit`-only filtering, keyset
pagination (no dupes/gaps across pages, strictly newest-first), an unknown
cursor being ignored rather than erroring, and the 90-day range clamp.

**Not verified here (no network/node_modules — same limitation as every
prior session):** vitest itself was not run, so the tests above are
reviewed, not executed. The `run-manual-migrations.ts` script was
bracket/syntax-reviewed only, not run against a real Postgres — in
particular I could not confirm `sql.begin(...)` + `tx.unsafe(...)` behaves
as expected with `postgres@^3.4.0` for a multi-statement `.sql` file (some
of the existing files, e.g. `0002_model_sync.sql`, contain several
statements separated by `;` in one file) — `postgres-js`'s `unsafe()` is
documented to support multi-statement strings, but this should be smoke-
tested with `--dry-run` first, then for real against a disposable database,
before pointing it at production.

**Tracker:** `B3` not ticked by me — tick once CI (`api-tests`) is green on
`frontend-v2` and you've dry-run, then run, `db:migrate:manual` somewhere
non-production first.

---

## Phase 8c — Admin: ops (models, channels, fraud, logs, audit)

**Built:** `features/admin/{models,channels,fraud,logs,audit}/` (hooks + components + index) and five thin routes under `app/[locale]/(admin)/admin/*/page.tsx`. `config/nav.ts`: the five 8c entries flipped to `enabled: true` (`nav.test.ts` verifies each has a page file). New `admin.{models,channels,fraud,logs,audit}Page` message namespaces in `en.json` + `ar.json` (parity: identical key sets, 943 leaf keys each); every key used by the 8c code was checked to exist by script.

**Deviations from the plan / phase summary (small, deliberate):**
- `models` uses ONE query (`models.listAll`) and filters the tabs client-side, instead of also calling `models.pending`. `pending` is a strict subset of `listAll`; one query = one invalidation target after sync/publish/toggle. Catalog is small (one row per gateway model).
- `models.toggleAvailability` fires immediately (no `ConfirmDialog`) — reversible, one switch; all Switches disable while one toggle is in flight (no double-fire). `publish`, `resolveFraudEvent`, `clearFraudFlag` DO go through a dialog with disable-while-pending.

**Bugs found & fixed in this pass (not in the original scope):**
1. **`admin.fraudTypes` was missing 2 of the 7 `fraud_type` enum values** (`REDEEM_DAILY_LIMIT`, `SUSPICIOUS_PATTERN`). The fraud table calls `tTypes(row.type)` — a real event of either type would have thrown a missing-message error and blanked the page. Added to both locales.
2. **The 3 `admin-money` e2e failures (codes / packages / payment-methods "dialog opens") are a real 8b a11y bug, not flakiness:** the dialog `<Label>`s had no `htmlFor` and the inputs no `id`, so `getByLabel("Batch label" / "Name (English)")` can never resolve (and screen readers can't associate them). Fixed in `codes/index.tsx` (explicit ids), `packages/index.tsx` and `payment-methods/index.tsx` (`Field` helper now uses `useId` + `htmlFor`). "manual payments" passed only because it asserts tabs, not a labelled input.
3. **Login e2e flake (`Received string: …/en/auth/login`) — probable cause: better-auth rate limiting.** `lib/auth.ts` (frozen) sets `rateLimit: { window: 60, max: 5 }`; the e2e job runs `next start` (production → limiter active) and `admin-money.spec.ts` signed in inside `beforeEach` (4 tests + retries) before `login.spec.ts` ran its 2 sign-ins → >5 sign-ins/min from one IP; rejected sign-ins leave the page on `/en/auth/login`. Fix (no frozen file touched): `e2e/auth.setup.ts` signs in as admin once → `e2e/.auth/admin.json`; `playwright.config.ts` gets a `setup` project the `chromium` project depends on; admin specs use `test.use({ storageState })`. Sign-ins per CI run drop from 10+ to 3. `e2e/.gitignore` ignores `.auth/`. **This is a diagnosis from code, not from the CI logs above the visible tail — see "How to verify".** I deliberately did NOT switch `finishLogin()` to a hard `window.location.assign` (an earlier session's idea): the code shows the client-router race is not what the evidence points to, and it would change UX without a proven cause.
4. Hardcoded English toasts in `use-models.ts` (sync result) and `use-fraud.ts` ("Fraud flag cleared.") → moved to i18n keys (would have shown English in the Arabic UI).
5. `ModelFormDialog.handleSubmit` had an unhandled rejection when `models.publish` failed (dialog correctly stayed open but the promise rejection was uncaught) → try/catch; the error still shows via `errorMessage` + the hook's toast.
6. Fraud user link was a plain `<a>` (full page reload) → `next/link`.

**New e2e:** `e2e/admin-ops.spec.ts` — read-only route smoke (heading renders) for the five pages. `/admin/channels` hits the gateway, unreachable in CI, so only the heading is asserted (it renders its error state there).

**Not verified (no network / node_modules in the authoring environment — same limitation as prior sessions):** `tsc`, ESLint, vitest, `next build`, and Playwright were NOT run. The 8c hooks/components were checked by reading against `models.router.ts`, `admin.router.ts` and `admin-logs.service.ts` (input shapes, enum values, cursor convention), not by compiling. In particular unverified: (a) `cloneElement(children, { id })` in the two `Field` helpers type-checks under `exactOptionalPropertyTypes`; (b) `Select` root (child of `Field` in payment-methods) tolerates the injected `id` prop; (c) the rate-limit diagnosis above; (d) Arabic plural forms in `channelsPage.modelCount`; (e) `next-intl` accepting the ICU strings as written.

**Tracker:** `8c` NOT ticked — tick after CI is green (`check`, `web-build`, `i18n-parity`, `api-tests`, `e2e`) and the preview checks below pass.

**Preview checks:** all five pages load in `/ar` and `/en` and appear enabled in the admin nav; logs: filter by user (full UUID) / model / date, "Load more" adds rows with no duplicates; audit: expand a row → before/after diff; models: Sync → toast in the active language, Publish a pending model → row moves to Published, toggle availability; fraud: Resolve removes the row from Unresolved and it shows under Resolved; Clear flag on a real flagged user (use a test account); channels: renders rows if the gateway token is admin-capable, otherwise the gateway's error message + Retry.

---

## Phase 8d — Admin settings decision (D7)

**Decision:** omit, per the plan's default. Recorded as **ADR-010** in `docs/architecture/decisions.md`. Docs-only phase: no code, no nav change (there is no `adminSettings` nav entry and no route to remove), no messages.

**Verified by reading the repo:** `apps/web/app/[locale]/(admin)/admin/` has no `settings` folder; `config/nav.ts` has no settings entry under the admin group.

**Not verified:** nothing executable in this phase. CI is unaffected (no code, no `docs/legal` change).

**Open items logged here so they aren't lost:**
- **B5** (platform settings + enforcement) — post-cutover backlog; ADR-010 is the revisit trigger.
- **Manual email confirmation (unplanned, requested during 8c testing):** new `admin.verifyUserEmail` procedure in `apps/api` (sets `email_verified = true` AND `status = 'active'`, writes an `audit_logs` row, with a Testcontainers test) + a "Confirm email manually" button on the admin user detail page and a "Pending verification" filter. Needs its own backend session before the UI. Root cause of the need: Resend delivers only to the account owner until a domain is verified — verifying the sending domain removes the need for day-to-day use. Interim workaround: SQL `UPDATE users SET email_verified = true, status = 'active', updated_at = now() WHERE email = '…';`.
- The plan's tracker in the uploaded copy of `FRONTEND_REBUILD_PLAN.md` is stale (6.1–8b unticked though code exists). Left untouched.

**Tracker:** `8d` ready to tick (docs-only). `8c` — tick once its CI is green.

---

## Phase 9.1 — Hardening (security headers, RTL, a11y, performance)

**Decision (yours: "whatever is better long-term"):** I edited `headers()` in the frozen `next.config.ts` — not Caddy — because the plan deploys the frontend to Vercel, where Caddy headers wouldn't apply; in-app headers travel with the code. Scope of the edit: the `headers()` list plus a small helper (`buildCsp`, `originOf`) and a `CSP_HEADER_NAME` constant above `nextConfig`; nothing else in the file changed. **Re-freeze `next.config.ts` after this.**

**Built:**
- Headers: `Referrer-Policy`, `Permissions-Policy` (camera/mic/geolocation off), `Strict-Transport-Security` (1 year, no `includeSubDomains`/preload — deliberately conservative), and a CSP that allows Turnstile (`challenges.cloudflare.com` for script/frame/connect), the API origin from `NEXT_PUBLIC_API_BASE_URL`, `img-src https:` (admin-pasted logos). **Report-Only** until the preview is clean; the enforcing flip is one constant.
- a11y: screen-reader announcements for chat replies (start + finish) in `chat-view.tsx`; new key `chat.responseReady` (en + ar).
- Contrast: light-mode primary `#B9791F` → `#98641A` (was 3.61:1 for white-on-gold buttons and 3.28:1 for gold text; now 5.03 / 4.58). Visible brand change; see the checklist for how to revert.
- `docs/frontend/HARDENING_CHECKLIST.md` — per-page sign-off sheet, CSP verification steps, contrast table, empty budget table.

**Found, no change needed (static):** RTL is already clean — physical-direction classes outside `components/ui` are comments or decorative `magicui`; chevrons have `rtl:rotate-180`.

**Deviations from the plan:**
- **Budgets not set** — needs a real `next build`; I did not invent numbers. Checklist has the table to fill from the `web-build` log.
- **`@next/bundle-analyzer` not added** — a new dependency would break CI's frozen lockfile until `pnpm-lock.yaml` is regenerated (`update-lockfile` workflow). Not worth blocking 9.1 on; the `First Load JS` column in the build log gives the same route numbers.
- **shiki lazy-loading skipped** — repo uses `rehype-highlight`; only worth doing if `/chat` is over budget once measured.
- **Markdown fixtures not re-reviewed** (listed for a human in the checklist).

**Not verified (no network / node_modules / browser — same as prior sessions):** `tsc`, ESLint, vitest, `next build`, e2e were NOT run. Specifically unverified: (a) the CSP itself — that Turnstile, chat streaming, charts, QR and logos raise zero violations (this is exactly what Report-Only is for); (b) `NEXT_PUBLIC_API_BASE_URL` is set at build/start on the deployment (if unset, `connect-src` omits the API origin and cross-origin chat calls would be reported); (c) the `React.useEffect` live-region announces once per reply under React strict mode; (d) the new primary looks acceptable in light mode; (e) HSTS isn't duplicated by Caddy/Vercel.

**Tracker:** `9.1` NOT ticked — tick after CI is green, the checklist §1 shows zero violations (then flip CSP to enforcing), and §2/§3 human passes are signed off.

---

## Phase 9.2a — E2E critical flows (monitoring/Sentry = 9.2b, not started)

**Unfrozen for this phase (you approved):** the `e2e` job in `.github/workflows/deploy.yml` only. **Re-freeze after.** Changes in that job: a `redis:7-alpine` service; `REDIS_URL` → the real Redis; `GATEWAY_URL` → `http://localhost:4010` (mock); `INTERNAL_API_URL` → `http://localhost:4000` (apps/api); `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` → empty (server check no-ops, widget reports a placeholder token — verified in `lib/turnstile-server.ts`, `components/auth/turnstile-widget.tsx`). All other jobs untouched.

**Built (all under `apps/web`):**
- `e2e/mock-gateway/server.mjs` — zero-dep Node mock of New API: SSE `/v1/chat/completions` (fixed reply "Hello from the mock gateway.", fixed usage 12 in / 6 out), `/v1/models`, `/api/channel/`, `/health`.
- `playwright.config.ts` — `webServer` is now an array: mock gateway (:4010) → apps/api (:4000, `NODE_ENV` unset so no background workers) → web (:3100).
- `e2e/support/db.ts` — `psql` helper (no new dependency ⇒ no lockfile change). Specs that need it `test.skip` without `DATABASE_URL`.
- `e2e/auth.setup.ts` — now also saves `e2e/.auth/user.json` (2 sign-ins per run total).
- New specs: `chat-stream` (browser → web → API → mock; text streams; exactly one `usage_debit`), `redeem` (seeded `seed-batch` code credits the exact `credit_amount` once; reuse rejected, balance unchanged), `register-login` (real register form → `/auth/verify` → DB-mark-verified → real login → `/chat`), `manual-payment-approve` (SQL-seeded package/method/claim; admin approves via UI with a deliberate **double-click**; balance rises by exactly the package credits once; one `payment` transaction), `admin-role-guard` (signed-out → login; regular user can't stay on `/admin`).
- New specs set `x-forwarded-for` per file so each has its own better-auth rate-limit bucket (insurance; see the 8c note — that diagnosis was from code, not confirmed).

**Deviations / honest limits:**
- `register-login` does **not** test email delivery or the verification link — CI has no mailbox; verification is a direct SQL update (same as the manual workaround).
- `manual-payment-approve` and `redeem` assert balance **deltas** on `user@localhost.dev`: run with `--workers=1` (CI already does) or parallel specs will corrupt each other's deltas.
- Redeem/manual-payment specs read/write the DB with `psql` → only ever point `DATABASE_URL` at a throwaway database.
- "Green three runs in a row" is yours to confirm by re-running the job; I can't run CI.

**Verified here:** the mock gateway was started and curled (health, SSE stream shape incl. usage chunk, 401 without a bearer, channel list) and `deploy.yml` parses as YAML with the redis service and new env. **Not verified (no network / node_modules / browser here — same as every prior session):** the specs and the API boot were not executed. Specifically unconfirmed, and the likeliest places for a first-run failure: (a) the API boots with `pnpm --filter @ai-platform/api start` (tsx) under the job env and `/health` answers without extra env; (b) selectors: chat `Type your message...` + `Send`, redeem input/submit/`already been used` alert, register labels/checkbox/`Create Account`, manual-payments row/`Approve` dialog — taken from the en message file and component source, not from a rendered page; (c) the redeem form's submit is enabled with the placeholder Turnstile token; (d) the first message in a brand-new chat may need a model auto-selected before Send is enabled; (e) `dblclick` on a dialog that closes mid-action doesn't error; (f) `payment_id` on the `transactions` row equals the claim id (assertion in the approve spec); (g) `Locator.and()` (Playwright ≥1.34; repo has ^1.48).

**How to run locally:** Postgres + Redis up, `pnpm --filter @ai-platform/db db:migrate` (+ the raw SQL migrations and both seeds, as in the CI job), export the same env as the `e2e` job (with `GATEWAY_URL=http://localhost:4010`, `INTERNAL_API_URL=http://localhost:4000`, empty Turnstile keys, real `REDIS_URL`/`DATABASE_URL`), `pnpm build`, then `pnpm exec playwright test --workers=1` in `apps/web`.

**Tracker:** `9.2` stays open until 9.2b (Sentry) is done and the e2e job is green three runs in a row.

---

## Phase 9.2b — Error monitoring (Sentry)

**Scope source:** the plan has no "9.2b" heading; scope = 9.2a note + plan §9.2 line ("Sentry or similar") + `LAUNCH_CHECKLIST.md` item. The uploaded plan's tracker was stale vs the repo copy; the repo copy was used.

**Unfrozen for this phase (you approved):** `apps/web/next.config.ts`, two edits only — (1) `buildCsp()` `connect-src` now includes the origin of `NEXT_PUBLIC_SENTRY_DSN`; (2) the export is wrapped in `withSentryConfig` **only when `SENTRY_AUTH_TOKEN` is set** (source-map upload), so CI/e2e/local exports are unchanged. **Re-freeze after.** Also touched outside `apps/web` (approved): `.env.example`, `docs/legal/PRIVACY_POLICY.md` (+ synced `apps/web/content/legal/privacy.md`), this file, the plan's 9.2 tracker row.

**Built (`apps/web`):**
- `lib/monitoring/config.ts` — pure (no SDK import): `isMonitoringEnabled`, `shouldIgnoreError`, `scrubEvent`, `beforeSend`, `procedureFromKey`, `redactText`. Ignores: `AbortError`, `NEXT_REDIRECT/NOT_FOUND`, network drops ("Failed to fetch", "Load failed"), ResizeObserver noise, tRPC UNAUTHORIZED/FORBIDDEN/BAD_REQUEST/NOT_FOUND/CONFLICT/PRECONDITION_FAILED/PAYLOAD_TOO_LARGE/UNPROCESSABLE_CONTENT/TOO_MANY_REQUESTS/CLIENT_CLOSED_REQUEST. Scrubs: cookies, all headers except user-agent/accept-language/content-type, request body, query string and hash (URLs + breadcrumbs), console breadcrumb arguments, user → id only, emails / bearer tokens / redeem-code-shaped strings in messages.
- `lib/monitoring/report.ts` — `reportError(error, {source, tags})`; never throws; no-op without DSN.
- `instrumentation.ts` (server + edge init, `onRequestError = Sentry.captureRequestError`), `instrumentation-client.ts` (browser init). Errors only: no replay, no tracing, `sendDefaultPii: false`.
- `app/global-error.tsx` (new — none existed): static ar+en fallback, inline styles, reports.
- Edited `components/layout/route-error.tsx` (reports) and `providers/trpc-query-provider.tsx` (Query/MutationCache `onError` → `reportError`; tag = procedure path only).
- `app/[locale]/dev/monitoring-test/` — 5 checks, gated by `HIDE_KITCHEN_SINK` (now the 4th page on that var; the `HIDE_DEV_PAGES` split is still open).
- `lib/monitoring/config.test.ts` — 15 cases.
- `package.json`: `@sentry/nextjs ^10.0.0`.

**Manual steps, in order:**
1. **Run the `Update Lockfile` workflow on `frontend-v2`.** Until then `check` / `web-build` / `web-unit` fail with `ERR_PNPM_OUTDATED_LOCKFILE`.
2. Sentry project (Next.js): enable *Prevent Storing of IP Addresses*, keep Data Scrubbing on, set retention ≤ 90 days (the Privacy Policy now says "up to 90 days"; free-plan default is 30).
3. Vercel env: `NEXT_PUBLIC_SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_ENVIRONMENT` = `preview` / `production`) for Preview first; `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as build-only (no `NEXT_PUBLIC_`). `NEXT_PUBLIC_*` is inlined at build → redeploy after setting.
4. Preview checks: see "How to verify" in the delivery message.

**Deviations / honest limits:**
- **Not covered:** `apps/api` (Fastify — where most chat/billing faults originate) and anything caught-and-returned as JSON by `app/api/**` handlers (e.g. `UPSTREAM_UNREACHABLE`) — `onRequestError` only sees unhandled errors. Needs a backend session (B4-style) with its own SDK + `Sentry.setupFastifyErrorHandler`.
- `useChatStream` failures are user-visible states and are **not** reported (would need an edit inside `features/chat`); candidate follow-up.
- No `tunnelRoute`: ad-blockers will drop some browser reports. Trade-off chosen to avoid proxying every report through our server.
- A server-rendered error can appear twice (server via `onRequestError`, client via `route-error`); they share the `digest` tag. Chosen over risking a lost report.
- `(auth)` and `(public)` groups still have no `error.tsx`; their errors fall to `global-error`. Not changed here.
- Docker path: `Dockerfile` (frozen) passes no build args, so `NEXT_PUBLIC_SENTRY_DSN` must be present at image build — same limitation as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Vercel is unaffected.
- Privacy Policy: added an "Error Monitoring Provider" subsection, two table rows, and bumped "Last Updated" to Sept 24, 2026. §9 promises 14 days' email notice for *material* changes — whether adding a processor counts is your/lawyer's call. `LAUNCH_CHECKLIST.md` monitoring item deliberately **not** ticked until a real DSN is live.

**Verified here:** `config.ts` + `config.test.ts` were executed under Node 22 (type-stripping) with a minimal vitest shim → 15/15 pass; `package.json` parses; `privacy.md` is byte-identical to `docs/legal/PRIVACY_POLICY.md` (what `legal-docs-sync` checks). **Not verified (no network / node_modules / browser — same as every prior session):** `tsc`, ESLint, real vitest, `next build`, e2e; that `@sentry/nextjs@^10` resolves and is compatible with Next 15.5 / React 19 / the pnpm 9 install (its `@sentry/cli` postinstall needs network); that `onRequestError` fires for middleware errors; that the edge bundle of `middleware.ts` stays within the host's size limit with the SDK in `instrumentation.ts`; that the browser SDK sets no cookie/storage (matters for the consent banner copy); that `withSentryConfig` options (`sourcemaps.deleteSourcemapsAfterUpload`, `telemetry`) are valid for the resolved version; that the DSN origin passes the CSP with zero Report-Only violations; that readable stack traces appear in Sentry.

**Tracker:** `9.2` NOT ticked — tick after (a) lockfile regenerated + CI green, (b) the e2e job green three runs in a row (9.2a), (c) preview checks 1–5 pass with a real DSN. `9.1` is also still open (CSP still Report-Only; when you flip it, Sentry is already in `connect-src`).

### 9.2b follow-up — first CI run failed at `Type check` (fixed, needs a re-run)

**What CI showed:** `Type-check & Lint` red (`tsc` exit 2). Green in the same run: `API Tests`, `Web Unit Tests` (the 15 new monitoring cases pass under real vitest), `i18n Key Parity`, `Legal Docs In Sync`. `Web Build` and `E2E` were still running when the log was captured — their results are not known here.

**Cause 1 — my mistake (`next.config.ts`):** `tsconfig.base.json` sets `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. I passed `org: process.env.SENTRY_ORG` (`string | undefined`) to `withSentryConfig`, which declares `org?: string`. I read `apps/web/tsconfig.json` but not the base it extends. Fixed with conditional spreads (option absent rather than `undefined`). The same log confirms the other options I used (`telemetry`, `widenClientFileUpload`, `sourcemaps.deleteSourcemapsAfterUpload`) are valid keys in the resolved SDK version.

**Cause 2 — a side effect of adding the dependency (`server/context.ts`, `SQL<unknown>` "separate declarations of a private property"):** the regenerated lockfile now holds two copies of `drizzle-orm@0.31.4`, one built against `@opentelemetry/api@1.9.0` and one against `1.9.1` (Sentry pulls in the newer patch). pnpm keys a package instance by its peer-dependency set, so `apps/web` and `@ai-platform/db` no longer share one `drizzle-orm` and their `SQL` types are incompatible. Fix: root `package.json` `pnpm.overrides` now pins `"@opentelemetry/api": "1.9.0"` (what the lockfile used before Sentry), so every consumer resolves one copy again. **Requires regenerating `pnpm-lock.yaml`.**

**Also hardened (would have failed the same job):** `config.test.ts` indexed arrays without `?.` (`noUncheckedIndexedAccess`); `isMonitoringEnabled` is now a type predicate (`dsn is string`) so `Sentry.init({ dsn })` receives a `string` under `exactOptionalPropertyTypes`.

**Order to apply:** (1) unzip over the repo and push to `frontend-v2`; (2) run **Update Lockfile** on `frontend-v2` (its commit is `[skip ci]`); (3) pull, push an empty commit (`git commit --allow-empty -m "ci: rerun"`) so CI runs against the new lockfile — *Re-run jobs* would reuse the old commit.

**Not verified:** that the override alone removes the duplicate `drizzle-orm` (I cannot run pnpm here). If `tsc` still reports `SQL<unknown>` mismatches, open the regenerated `pnpm-lock.yaml` and search `drizzle-orm@0.31.4_` — more than one distinct suffix means another peer still differs; paste the two suffixes. Also unverified: `tsc` on the edited files (only the pure logic was re-executed: 15/15), and anything from `Web Build` / `E2E`.
