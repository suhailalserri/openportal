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
