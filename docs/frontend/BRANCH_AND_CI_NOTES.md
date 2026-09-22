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
