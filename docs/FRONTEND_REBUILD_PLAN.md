# openportal — Frontend Rebuild Plan (`apps/web` v2)

**Version 1.0 · 2026-09-18**
Based on an audit of `ai-platform (29).zip` and the New API `web/` folders (used as a *structure* reference only — they are AGPL-3.0, so we write our own code).
Save this file as `docs/FRONTEND_REBUILD_PLAN.md`. Tick the tracker in §5 at the end of every session.

---

## 0. How to run a session

1. **One session = one sub-phase** (e.g. `4b`). Never mix two.
2. Start by uploading the latest repo zip + this file, then paste the kickoff prompt from Appendix A.
3. Claude writes the **5-point Phase Summary** (Appendix B) *before any code*. You approve it. Then it builds.
4. **Claude's sandbox has no network**, so it cannot run `pnpm install`, `tsc`, `next build` or tests. The verifier is **GitHub Actions + the Vercel preview** on branch `frontend-v2`. A session is only done when:
   - CI is green on `frontend-v2`
   - the phase's "Done when" checklist passes on the preview
   - the tracker (§5) is ticked
5. **Deliverable each session:** a zip of new/changed files at repo-relative paths **plus a DELETE list**.
6. **One blocker at a time.** If CI fails, paste only the failing log lines into the next message. No new scope until green.
7. `main` is untouched until Phase 9, except the backend PRs in §7 (additive only).

---

## 1. What the audit found (ground truth)

Everything below was read from the zip. Items marked **(unverified)** could not be confirmed from code alone.

- **F1 — UI and server share one app.** `apps/web` imports `appRouter` from `@ai-platform/api/routers` (`server/router.ts`), hosts Better Auth (`lib/auth.ts`) and ~25 route handlers (`app/api/**`). The rebuild replaces the **UI layer only**.
- **F2 — Chat contract is minimal.** `POST /api/chat` proxies to Fastify `POST /chat`, which reads only `{ model, messages, conversationId }` with **no validation** (a bare `as` cast). The response is a **`text/plain` stream of content deltas** — no reasoning, sources, usage or cost events reach the client.
- **F3 — No temperature / top_p / max_tokens / system prompt** is forwarded to the gateway. `conversations.system_prompt` exists in the schema but nothing writes it.
- **F4 — Retries duplicate the user message.** `streamChat` inserts the last user message on every call. A retry or regenerate creates a second identical row. Needs an idempotency key (B1).
- **F5 — Client abort is (unverified).** The upstream `fetch` is not bound to the client disconnect. Whether Stop leaves the provider generating (and billing the full output) must be checked in B1.
- **F6 — No user-level analytics.** `user.*` has only `getProfile, updateProfile, generateApiKey, revokeApiKey, getApiKeyInfo, getReferralStats`. Usage data exists only under `admin.*`. `billing.getTransactions` (limit/offset) covers history.
- **F7 — Two redeem paths.** `POST /api/redeem` (Turnstile + rate limit) is the live one; `billing.redeemCode` (tRPC) is for API consumers. The new UI uses `/api/redeem`.
- **F8 — Payments are Yemen/YER.** Jaib vouchers + manual transfer with admin approval; Moyasar/SAR/Mada/Apple Pay are **disabled**. Master-plan Phases 15/23 don't apply. Source of truth: `docs/PAYMENT_METHODS_PLAN.md`.
- **F9 — Auth contract.** Better Auth email/password + 2FA plugin. Sign-up needs header `x-turnstile-token`; referral rides on `x-referral-code`. Server rules: min 8 chars + 1 uppercase + 1 digit (errors `WEAK_PASSWORD`, `CAPTCHA_FAILED`). Only the admin layout has a **server-side** guard; other pages guard client-side.
- **F10 — CI is thin.** `.github/workflows/deploy.yml` (named "Test") runs type-check + lint only: no tests, no `next build`. No ESLint config file exists in the zip, so lint enforces nothing I can identify **(check the last CI run)**. Your payments doc records several rounds of Vercel build errors and prod 500s from exactly this gap.
- **F11 — `/api/status` is a stub** (always `healthy`), so `StatusBanner` is decorative.
- **F12 — `admin/settings` is UI-only.** Local `useState`, nothing persists, and no settings table/procedures exist.
- **F13 — Missing index.** `transactions` has only `(user_id, created_at DESC)`. Admin dashboard/logs filter by `type` / `created_at` with no supporting index.
- **F14 — Font family name is wrong.** The layout requests `IBM+Plex+Arabic`; Google Fonts lists the family as **IBM Plex Sans Arabic**. Arabic text is very likely falling back to a system font today.
- **F15 — Dead/junk files.** `tailwind.config.ts` is v3-style and not loaded (no `@config` in `globals.css`, Tailwind v4). A literal directory named `auth/{login,register,verify,forgot,reset}` exists, plus empty dirs (`billing/success`, `admin/codes/generate`, `api/user/api-key`, `api/webhooks/status`, `public`).
- **F16 — Legal hard gate is NOT fully met.** `docs/legal/` has the three documents, but `ACCEPTABLE_USE_POLICY.md` has **no date**, has no explicit rate-limit acknowledgment, and all three contain `@yourplatform.com` placeholders. ToS/Privacy are dated June 18, 2026. Privacy does name the four AI providers. The files are English-only (no Arabic version).
- **F17 — API access is not OpenAI-compatible.** The only public endpoint a user API key can call is `POST /chat` (custom body, plain-text stream). The master plan's "OpenAI-compatible API" copy would be false.
- **F18 — Preview logins work.** `trustedOrigins` is dynamic for Vercel preview domains, so `frontend-v2` previews can sign in.

---

## 2. Decisions

### Locked (change only by explicit decision)
- **L1** Keep **Next.js 15 + next-intl + Tailwind v4 + Radix/shadcn + Better Auth client + tRPC/React Query**. Reason: this app *is* the auth + tRPC host (F1); moving to a Vite SPA would mean re-hosting both.
- **L2** No `src/` folder. New folders sit beside the frozen ones, so frozen files never move.
- **L3** Rebuild on branch `frontend-v2`; `main` keeps the legacy UI. Backend PRs go to `main` and are **additive/backward-compatible** so the legacy UI keeps working.
- **L4** Route files are thin: `page.tsx` only imports from `features/*`.
- **L5** Data access: **tRPC first**. REST only where no tRPC equivalent exists (chat, conversations, redeem, sessions, export/delete).
- **L6** Verification = CI + Vercel preview.

### Open (defaults apply if you don't answer)
| # | Decision | Default | Decide by |
|---|---|---|---|
| D1 | Preview environment data | **DECIDED (0.2): production DB, dedicated test accounts only.** Revisit before 5.1 and 8b (money flows / admin approvals on preview touch real data). | 0.2 |
| D2 | Brand/design direction | Claude proposes 3 token presets, you pick | 1.1 |
| D3 | Chat state | Custom reducer hook (backend stream is plain text; edit/regenerate need control) vs AI SDK `useChat` | 4b |
| D4 | Charts | `recharts` (no chart lib today; admin `RevenueChart` is inline SVG) | 6.1 |
| D5 | Vercel AI Elements | 4a spike; compatibility with `ai@^4` is **unverified**. Fallback: own components | 4a |
| D6 | Digits in Arabic UI | Western digits (0-9) everywhere, forced via `numberingSystem: "latn"` | 1.1 |
| D7 | Admin settings page | Defer (F12) | 8d |
| D8 | Screenshot upload on manual claims | Defer (no storage wired) | 5.2 |

---

## 3. Rules for every phase

1. **Money is never computed client-side.** The UI shows server results. Credits are integer micro-units; one `formatCredits()` is the only conversion.
2. **RTL is structural.** Logical utilities only (`ps/pe/ms/me/start/end`); a lint rule bans `ml- mr- pl- pr- left- right- text-left text-right border-l border-r rounded-l rounded-r`. Code blocks are always `dir="ltr"`. Direction-implying icons flip in RTL.
3. **Radix: conditional rendering, never CSS-hiding.** Render context-dependent primitives (e.g. `DialogClose`) from a prop such as `isMobile`, not `hidden md:block`. This already caused a production crash (`DialogClose must be used within Dialog`).
4. **Server layouts guard; client checks are UX only.**
5. **The redeem checksum stays server-side** (`CODE_SALT`). The client checks *shape only* (alphabet + length), never the checksum.
6. **All strings go through next-intl.** ar/en key parity is a CI job (currently 230/230).
7. **Model output is untrusted.** No `rehype-raw`, no `dangerouslySetInnerHTML`, remote markdown images are not auto-loaded, links get `rel="noopener noreferrer"`.
8. **Nothing secret in the client bundle.** Only `NEXT_PUBLIC_*` (Turnstile site key, public API base URL).
9. **Clear per-user client caches on sign-out** (IndexedDB conversations, localStorage prefs) — shared-device privacy.
10. **Every phase opens with the 5-point Phase Summary** (Appendix B).

---

## 4. Target structure

```
apps/web/
├─ app/[locale]/
│  ├─ (public)/        page.tsx (landing), legal/[doc]/page.tsx
│  ├─ (auth)/auth/     login, register, verify, forgot, reset
│  ├─ (app)/           layout.tsx (server session guard + shell)
│  │    chat/  chat/[id]/  billing/  dashboard/  usage/  settings/
│  └─ (admin)/admin/   dashboard users users/[id] codes packages
│                      payment-methods manual-payments models channels
│                      fraud logs audit
├─ app/api/**          FROZEN
├─ server/  lib/*  i18n/  middleware.ts  next.config.ts   FROZEN (lib/ may gain NEW files)
├─ features/
│    chat/  billing/  dashboard/  usage/  auth/  landing/  legal/
│    settings/ (sections/*, registry.ts)
│    admin/ (shared/, users/, codes/, packages/, payment-methods/,
│            manual-payments/, models/, channels/, fraud/, logs/, audit/)
├─ components/  ui/ (shadcn)  layout/  data-table/  markdown/  shared/
├─ providers/   theme, direction, trpc-query, consent
├─ styles/      theme.css, theme-presets.css, index.css
├─ config/      nav.ts, constants.ts
├─ messages/    ar.json, en.json (namespaced per feature)
└─ scripts/     check-i18n.ts, sync-legal.ts
```

**Frozen zone (do not edit in any frontend session):** `app/api/**`, `server/**`, `lib/{auth,auth-client,trpc,redeem,generate-code,turnstile-server}.ts`, `middleware.ts`, `i18n/request.ts`, `next.config.ts`, `Dockerfile`, everything outside `apps/web`.
Backend changes happen only in §7 sessions.

Each feature folder follows the New API convention: `components/ hooks/ lib/ types.ts index.tsx`.

---

## 5. Progress tracker

| ID | Session | Status |
|---|---|---|
| 0.1 | Legal gate fix | [x] |
| 0.2 | Branch, CI, preview | [x] |
| 0.3 | Contract freeze + cleanup | [x] |
| 1.1 | Design direction + tokens | [x] |
| 1.2 | Foundation code + kitchen-sink | [x] |
| 2.1 | App shell + guards | [x] |
| 2.2 | Shell widgets + states | [x] |
| 3.1 | Auth pages | [x] |
| 3.2 | Legal, landing, consent, e2e harness | [x] |
| B1 | Backend: chat contract | [x] |
| 4a | Chat: message rendering | [x] |
| 4b | Chat: streaming + state | [x] |
| 4c | Chat: input, models, parameters | [x] |
| 4d | Chat: conversations + cache | [x] |
| 5.1 | Billing: wallet + redeem | [x] |
| 5.2 | Billing: buy flow + history | [x] |
| B2 | Backend: user usage + index | [x] |
| 6.1 | Dashboard | [x] |
| 6.2 | Usage log | [ ] |
| 7.1 | Settings: registry + profile + security | [ ] |
| 7.2 | Settings: preferences, API, referral, privacy | [ ] |
| 8a | Admin: shell + data-table | [ ] |
| 8b | Admin: money ops | [ ] |
| B3 | Backend: admin logs + audit | [ ] |
| 8c | Admin: ops (models, channels, fraud, logs, audit) | [ ] |
| 8d | Admin: settings decision | [ ] |
| 9.1 | Hardening: RTL, a11y, perf, security | [ ] |
| 9.2 | E2E + monitoring | [ ] |
| 9.3 | Cutover + cleanup | [ ] |

~28 sessions. Backend sessions (B*) run just before the phase that needs them.

---

## 6. Phases

### Phase 0 — Gate, branch, CI (3 sessions)
**Depends on:** nothing. **Nothing in Phase 1+ starts until 0.1 passes.**

**0.1 Legal gate fix**
- **Build:** add a date to `ACCEPTABLE_USE_POLICY.md`; add an explicit rate-limit acknowledgment clause; replace every `@yourplatform.com` in all three docs; confirm ToS/Privacy dates.
- Keep the existing filenames (`TERMS_OF_SERVICE.md` etc.). They differ from the gate wording, but the gate checks content, and Linux is case-sensitive so Phase 3 loads the exact names.
- **Done when:** all three files carry a date · `grep -R "yourplatform" docs/legal` is empty · AUP has the rate-limit clause.
- **Not dev-blocking, launch-blocking:** lawyer review (`LAUNCH_CHECKLIST.md`) and Arabic versions.
- **Breaks if wrong:** ToS §12 promises 14 days' notice by email; with a placeholder contact domain that promise can't be honoured and users cannot reach you.

**0.2 Branch, CI, preview**
- **Build:** create `frontend-v2` from `main`. Extend `.github/workflows/deploy.yml` with jobs:
  - `check`: type-check + lint
  - `api-tests`: `pnpm --filter @ai-platform/api test` (Testcontainers works on GitHub's Ubuntu runners)
  - `web-build`: `next build` for `apps/web` with **dummy env** (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `CODE_SALT`, …) because `@ai-platform/db` throws at import when `DATABASE_URL` is unset
  - `web-unit`: vitest (activates in 1.2)
  - `i18n-parity`: `scripts/check-i18n.ts` (activates in 1.2)
- Add a real ESLint config for `apps/web` including the physical-direction class ban (Rule 2).
- Confirm Vercel builds previews for `frontend-v2`. Decide **D1**.
- **Done when:** a PR into `frontend-v2` runs every job green on the **unchanged legacy code** (baseline). If `api-tests` is red, fix or explicitly skip-list now.
- **Breaks if wrong:** with type-check only, a build-breaking import reaches Vercel and shows up as a prod 500 (already happened repeatedly, per `PAYMENT_METHODS_PLAN.md`). `next build` in CI catches it pre-deploy.

**0.3 Contract freeze + cleanup**
- **Build:** verify Appendix C against the code and commit it as `docs/frontend/API_CONTRACT.md`; `git tag legacy-ui` on `main`; delete the junk/empty dirs from F15 on `frontend-v2`.
- **Done when:** contract doc merged · tag exists · CI green.

---

### Phase 1 — Design system & foundation (2 sessions)
**Depends on:** 0.x complete. **New API reference:** `src/styles/theme.css`, `theme-presets.css`, `context/theme-provider.tsx`, `context/theme-customization-provider.tsx`.

**1.1 Design direction + tokens**
- **Build:** decide D2/D6. Create `styles/theme.css` with semantic tokens for light **and** dark: background, foreground, card, popover, primary, secondary, muted, accent, destructive, **success, warning, info**, border, input, ring, chart-1…5, sidebar-*. Add `theme-presets.css` using `[data-theme-preset]` (ship 3 presets max). Radius/shadow/motion tokens with `prefers-reduced-motion`.
- **Fonts via `next/font/google`:** `IBM_Plex_Sans_Arabic` (Arabic), `Inter` (Latin), `JetBrains_Mono` (code). No `<link>`/`@import` to Google.
- **Done when:** three preset screenshots viewed on your phone (light+dark, ar+en) and one chosen · text/background contrast passes WCAG AA for body and muted text.
- **Breaks if wrong:** the old code requested a Google Fonts family that doesn't exist under that name (F14), so Arabic silently fell back to a system font. `next/font` with the real family name fails the *build* if wrong instead of failing silently.

**1.2 Foundation code + kitchen-sink**
- **Build:**
  - shadcn primitives: button, input, textarea, select, dialog, alert-dialog, sheet, dropdown-menu, tabs, switch, tooltip, scroll-area, avatar, separator, skeleton, badge, card, table, form
  - `providers/`: next-themes, **Radix `DirectionProvider`**, tRPC+Query, Sonner with `dir`
  - `lib/format.ts`: `formatCredits(micro)`, `formatYer`, `formatDate` (fixed `numberingSystem: "latn"`)
  - `scripts/check-i18n.ts` (parity + missing/unused keys)
  - `/dev/kitchen-sink` (404 in production) rendering every primitive
  - delete the legacy `components/`, `hooks/`, page files, `globals.css`, `tailwind.config.ts` (leave one placeholder `page.tsx`)
- **Tests:** vitest for `formatCredits` (0, 1, 999_999, 1_000_000, 2_670_000_000) and a lint-rule test proving `ml-2` fails.
- **Done when:** all CI jobs green · kitchen-sink opens in `/ar/` and `/en/`, both themes · arrow-key navigation in Tabs/Dropdown behaves correctly in Arabic.
- **Breaks if wrong:** without `DirectionProvider`, Radix menus, tabs and arrow-key navigation run backwards in Arabic. Float math on micro-credits would show off-by-a-cent balances; `formatCredits` is the single conversion point.

---

### Phase 2 — App shell & routing (2 sessions)
**Depends on:** Phase 1. **New API reference:** `components/layout/components/{app-sidebar,nav-group,nav-link-item,authenticated-layout,app-header,section-page-layout,mobile-drawer,main}.tsx`, `config/top-nav.config.ts`.

**2.1 Shell + guards**
- **Build:** route groups `(public) (auth) (app) (admin)`. `(app)/layout.tsx` is a **server** component: `auth.api.getSession` → redirect to `/{locale}/auth/login?next=…`. `(admin)` layout keeps the role check (`admin|superadmin`). `config/nav.ts` drives the sidebar (role-filtered). Sidebar (desktop) + Sheet drawer (mobile, rendered by prop per Rule 3). `SectionPage` layout wrapper.
- **`sanitizeNext(next)`**: accepts only same-origin paths matching `^/(ar|en)/`.
- **Done when:** unit tests for `sanitizeNext` (`//evil.com`, `https://evil.com`, `/\evil`, `javascript:`, valid paths) and role-filtered nav · preview: signed-out `/ar/chat` redirects to login and returns after login · non-admin `/en/admin` redirects.
- **Breaks if wrong:** an unsanitized `next` param is an open redirect after login (phishing). `sanitizeNext` + tests prevent it.

**2.2 Shell widgets + states**
- **Build:** BalanceWidget (`billing.getBalance`, low/zero states), AccountMenu, LanguageSwitcher, ThemeToggle + preset picker, `error.tsx` / `not-found.tsx` / `loading.tsx` per group. **StatusBanner: removed in v1** (F11) — restore only when B4 makes `/api/status` real.
- **Done when:** preview checks in ar+en · zero-balance state renders · sign-out returns to login.

---

### Phase 3 — Auth, legal, landing (2 sessions)
**Depends on:** Phase 2, 0.1 (legal gate).

**3.1 Auth pages**
- **Build:** `features/auth/`
  - login: email/password; if `twoFactorRedirect`, swap inline to a TOTP / backup-code step
  - register: password rules mirroring the server (8 chars, 1 uppercase, 1 digit); Turnstile widget → header `x-turnstile-token`; `?ref=` captured → header `x-referral-code`
  - verify: `verifyEmail` + resend with cooldown
  - forgot, reset
  - Arabic copy for `WEAK_PASSWORD`, `CAPTCHA_FAILED`, rate limit (Better Auth: 5/min), suspended account
- **Verify first:** `lib/auth.ts` in this zip has `requireEmailVerification: true` unconditionally. Confirm what your deployed version does when `RESEND_API_KEY` is unset.
- **Done when:** preview: register → verify screen → (seeded user) login → logout · TOTP step appears for a 2FA user · unit tests for the password-rule helper.
- **Carried over from 2.1 (needs a real session, so it could not be checked earlier):**
  · preview: signed-out `/ar/chat` → login → after sign-in returns to `/ar/chat` (`resolvePostLoginTarget`)
  · admin session: `/en/admin` renders the shell; the admin group shows in the sidebar
  · non-admin session: `/en/admin` redirects to `/en/chat`; no admin group in the nav
  · 360px: the drawer opens from the start edge in ar and en, and closes on link tap and on the close button
  · `session.user.role` is populated at runtime (cookie cache can lag a role change by up to 5 min)
  · sidebar heading and "Soon" row contrast checked in both themes
- **Breaks if wrong:** client rules weaker than server rules just move the error to after Turnstile is spent; mirroring them (and keeping the server authoritative) avoids wasted captcha verifications.

**3.2 Legal, landing, consent, e2e harness**
- **Build:** `scripts/sync-legal.ts` copies `docs/legal/*.md` into `apps/web/content/legal/` (CI fails if out of sync — Vercel builds may not see `../../docs`). `/legal/[doc]` renders them (English fallback + a notice while no Arabic exists). Landing page from public procedures `models.list` + `billing.listPackages` (real prices). Minimal consent banner (only essential cookies exist today; hook is ready for later analytics). **Playwright harness** in CI: Postgres service container + migrations + `pnpm db:seed` + API + web; first smoke test = login.
- **Done when:** landing shows live models/prices · legal pages render in both locales · Playwright login test green in CI.

---

### Backend B1 — Chat contract (before 4c)
See §7. **Do 4a and 4b first; B1 must land before 4c.**

### Phase 4 — Chat core (4 sessions)
**Depends on:** Phase 3, B1 (for 4c). **New API reference:** `features/playground/index.tsx`, `components/chat/playground-chat.tsx`, `components/input/*`, `components/message/*`, `hooks/use-chat-handler.ts`, `hooks/use-stream-request.ts`, `lib/streaming/*`, `lib/storage/*`, `lib/parameters/*`, `src/components/ai-elements/{conversation,message,response,reasoning,code-block,prompt-input}.tsx`. Skip its React-Flow pieces (`canvas node edge connection controls panel toolbar`) and `features/chat/` (link-out to other clients).

**Chat contract (from the audit — do not assume more):**
- Request: `POST /api/chat` `{ model, messages[{role,content}], conversationId? }`. Create the conversation first (`POST /api/conversations`); the server persists the user turn **and** the assistant turn — the client must not save messages itself.
- Response: `text/plain` deltas. Errors are JSON `{ error, message, status?, redirectTo? }`: `INSUFFICIENT_BALANCE` (402), `CONTEXT_TOO_LONG` (400), `MODEL_NOT_FOUND` (404), `MODEL_UNAVAILABLE` (503), `TIMEOUT` (504), `GATEWAY_ERROR` (502), `RATE_LIMIT_EXCEEDED` (429), 401, plus proxy errors `CONFIG_ERROR` (500), `UPSTREAM_UNREACHABLE` / `UPSTREAM_ROUTE_NOT_FOUND` (502).
- Interrupted streams are stored with `isPartial: true` and billed for what was received.

**4a Message rendering**
- **Build:** `features/chat/components/message/*`: conversation scroller (stick-to-bottom), message component, markdown renderer (`react-markdown` + `remark-gfm`, shiki loaded lazily), `CodeBlock` (LTR, copy, language label), `unicode-bidi: plaintext` on paragraphs, streaming cursor, per-message metadata (model, tokens, cost from stored fields), partial-response badge, error message + actions. Render the last N messages with "load earlier" (New API caps at 24) — virtualize only if measured slow.
- **D5 spike:** try installing 5–6 AI Elements in a throwaway commit; if `ai@^4` types break the build, fall back to own components.
- **Tests:** markdown snapshots for Arabic + code mixed in one message · XSS fixtures (`<script>`, `javascript:` link, remote `![](…)` image) render inert.
- **Done when:** CI green · preview `/dev/chat-render` fixture page renders long Arabic answers with code blocks correctly in RTL.
- **Breaks if wrong:** a model can emit markdown images that load attacker URLs (tracking) or raw HTML; the XSS fixtures lock this down.

**4b Streaming + state**
- **Build:** `useChatStream` (D3) built on a **pure reducer**: `idle → sending → streaming → done | stopped | error | partial`. `fetch` + `response.body.getReader()` + `AbortController` (Stop), send lock (no double-send), retry, regenerate. Handle: 401 mid-stream → keep draft, redirect with `next`; 402 → balance modal; balance hits zero mid-stream → stream finishes, next send is blocked; `useOnlineStatus` offline banner; `useTabConflict` (BroadcastChannel).
- **Tests (vitest, mock stream):**
  - chunked delivery preserves order and never buffers to the end
  - **an Arabic multi-byte character split across two chunks decodes correctly** (`TextDecoder` with `{ stream: true }`)
  - Stop → `stopped` and no further state updates
  - a network drop → `partial`
  - a second send while `streaming` is ignored
- **Done when:** CI green · preview: send, stop, retry, 402, expired session, offline all behave · admin logs show **exactly one** `usage_debit` per completed stream.
- **Breaks if wrong:** decoding each chunk without `stream: true` corrupts Arabic letters at chunk boundaries (garbled characters mid-word) — the split-character test guards it.

**4c Input, models, parameters** (needs B1)
- **Build:** input bar (Enter sends, Shift+Enter newline, **IME-safe** via `isComposing`, auto-resize), token estimate `⌈chars/4⌉` (same as the server) with warning at 95% of the model's context, model picker from `models.list` (badge, provider, tier, context, credits per K in/out, avg latency; remember last model in localStorage), parameter panel (temperature, top_p, max_tokens, system prompt) shown only once B1 is deployed. No attachments in v1 (no upload path even though `supportsVision` exists).
- **Done when:** CI green · preview: over-limit message disables Send with the Arabic warning · parameters change the response and persist per conversation.
- **Breaks if wrong:** Enter during Arabic IME composition sends half-typed text; the `isComposing` guard + a unit test prevent it.

**4d Conversations + cache**
- **Build:** sidebar list (grouped Today / Yesterday / This week / Older, pin, rename, soft-delete, client-side search over the loaded 50), new-chat and empty state with suggested prompts, routes `/chat` and `/chat/[id]`, IndexedDB cache (`idb-keyval`) **namespaced by user id and cleared on sign-out** (Rule 9), optimistic updates.
- **Done when:** CI green · preview: reload restores the conversation instantly · sign-out then sign-in as another user shows none of the first user's cached chats.
- **Breaks if wrong:** an un-namespaced IndexedDB cache leaks one user's conversations to the next user on a shared device.

---

### Phase 5 — Billing (2 sessions)
**Depends on:** Phase 3. **New API reference:** `features/wallet/{index,wallet-stats-card,recharge-form-card,dialogs/*,hooks/use-redemption,use-billing-history}`. Skip `creem-*`, `waffo-*`, `affiliate-*`, `transfer-dialog`, `subscription-plans-card` (you sell prepaid credits).

**5.1 Wallet + redeem**
- **Build:** balance card (low/zero states), redeem box → `POST /api/redeem` `{ code, turnstileToken }`: dash auto-format, paste button, **shape check only** from constants in `packages/config` (alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 4×4 groups), Turnstile, disabled while pending. Error map: `INVALID_FORMAT NOT_FOUND ALREADY_USED EXPIRED REVOKED TOO_MANY_ATTEMPTS DAILY_LIMIT_REACHED CAPTCHA_FAILED`. Success animation + balance refresh.
- **Tests:** shape validator with 10,000 random invalid strings → zero network calls (network assertion in Playwright for a sample; pure-function loop in vitest for the 10,000).
- **Done when:** CI green · Playwright: seeded code redeems, balance increases, reuse shows `ALREADY_USED`.
- **Breaks if wrong:** shipping `CODE_SALT` (or the checksum routine) to the browser to "validate early" would let anyone mint valid-looking codes. Shape-only client check keeps the checksum server-side.

**5.2 Buy flow + history**
- **Build:** package picker (**YER only**, `billing.listPackages`; always write "يمني" after ريال), payment-method selector (`listPaymentMethods`), **Jaib** instruction panel (account/network code, numbered steps, scroll-to-redeem), **manual transfer** (wallet numbers, server-generated `referenceCode`, claim form `submittedTxRef / senderPhone / senderName / notes`, "my claims" list with pending/approved/rejected), transaction history (`billing.getTransactions`, paginated; badges for `redeem usage_debit admin_credit admin_debit refund payment referral_bonus`), pricing table from `models.list`, CSV export of the loaded history. D8: no screenshot upload.
- **Done when:** CI green · Playwright: submit a claim → appears as `pending` · (after 8b) admin approves → balance credited once.
- **Breaks if wrong:** a double-tap on "submit claim" creates duplicate pending claims; disable-while-pending in the UI plus the server's per-user limits contain it.

---

### Backend B2 — User usage + index (before 6.1)
See §7.

### Phase 6 — Dashboard & usage (2 sessions)
**Depends on:** B2. **New API reference:** `features/dashboard/{index,components/overview/{overview-dashboard,summary-cards},components/ui/{stat-card,panel-wrapper},components/models/*}`, `features/usage-logs/` (table + filter bar only). Skip `flow/`, `users/`, `uptime-panel`.

**6.1 Dashboard**
- **Build:** period switch (7/30/90 days) · summary cards (spent, requests, tokens in/out, avg cost per request, top model) · spend-over-time chart · per-model breakdown · empty state for zero usage. D4 decides the chart library. Check charts in RTL (axis direction).
- **Done when:** CI green · preview in ar+en · numbers match the usage log totals for the same period.

**6.2 Usage log**
- **Build:** table with cursor pagination, filters (model, date range), row detail (model, tokens, cost, request id), CSV export through a user-scoped REST route (`GET /api/usage/export`, added in B2).
- **Done when:** CI green · filtered CSV matches the on-screen rows.

---

### Phase 7 — Settings (2 sessions)
**Depends on:** Phase 3. **New API reference:** `features/system-settings/components/{settings-page,settings-section,settings-card,settings-accordion,settings-form-layout,form-dirty-indicator,form-navigation-guard}`, `hooks/use-form-dirty-guard`, `billing/section-registry.tsx`; user side `features/profile/*`.

**7.1 Registry + profile + security**
- **Build:** `features/settings/registry.ts` (id, icon, titleKey, visible, component) — the fix for one giant page. Tabs on desktop, accordion on mobile. Dirty-form guard.
  - **Profile:** display name (`user.updateProfile`), email read-only, initials avatar (no upload in v1).
  - **Security:** change password (`changePassword`), 2FA enable → QR (from `twoFactor.enable`) → verify → backup codes shown once; disable requires password; active sessions list/revoke/revoke-others.
- **Verify first:** why `app/api/user/sessions*` wrap Better Auth (they may deliberately hide session tokens). Reuse them if so.
- **Done when:** CI green · preview: enable 2FA, sign out, sign in with TOTP · revoked session is logged out.
- **Breaks if wrong:** showing backup codes more than once, or logging session tokens to the client, defeats 2FA/session security; the wrappers and "shown once" behaviour prevent it.

**7.2 Preferences, API access, referral, privacy**
- **Build:**
  - **Preferences:** locale, theme + preset, default model (localStorage).
  - **API access:** `getApiKeyInfo / generateApiKey / revokeApiKey`; key shown once; docs describe the **real** endpoint (`POST /chat`, Bearer key, plain-text stream) with a curl example (F17). Needs a public API base URL constant (`NEXT_PUBLIC_API_BASE_URL`).
  - **Referral:** `getReferralStats`, share link `?ref=CODE`, copy/share; rules text = bonus after the friend's **first payment** (ADR-009).
  - **Data & privacy:** export (`/api/user/export-data`), delete account (password confirm; 2FA code if enabled), legal links. Keep the section named "Data & Privacy" — the Privacy Policy points to *Settings > Data & Privacy*.
- **Done when:** CI green · preview: key shown once then only the prefix · export downloads JSON · delete-account flow completes on a throwaway account.
- **Breaks if wrong:** telling users the API is "OpenAI-compatible" when it isn't produces support load and refund requests.

---

### Phase 8 — Admin (4 sessions)
**Depends on:** Phase 2, 5. **New API reference:** `features/usage-logs/components/*`, `features/redemption-codes/*`, `src/components/data-table/*` (structure only).

**8a Shell + data-table**
- **Build:** admin layout, reusable `DataTable` (server pagination/sort/filter via URL search params, column visibility, empty/loading/error states, RTL), `ConfirmDialog` (typed confirmation for destructive/money actions).
- **Done when:** CI green · table survives reload with filters kept in the URL.

**8b Money ops** (existing procedures)
- **Build:** users list + detail (`listUsers`, `getUserDetail`, `updateUserStatus`, `adjustCredits` with mandatory reason); codes (`generateCodes` payment method × package × count, `listCodeBatches`, `codeInventory`, `getBatchCodes`, `revokeCodeBatch`, `revokeCode`, CSV export + print view); packages CRUD; payment methods CRUD; manual-payments queue (`listManualPayments`, `approveManualPayment`, `rejectManualPayment`).
- **Done when:** CI green · Playwright: admin approves a claim → user balance increases exactly once (second click does nothing) · code batch CSV downloads.
- **Breaks if wrong:** approve/reject is a money action; a double-click or a stale table must not credit twice. The server's atomic status flip is the guarantee; the UI adds disable-while-pending and a re-fetch after every action.

**B3 (backend) then 8c Ops**
- **Build:** dashboard (`getDashboardStats`, `getRevenueTimeseries`, `getModelUsageBreakdown`, `getRecentTransactions`, `gatewayChannels`), models (`listAll`, `pending`, `sync`, `publish`, `toggleAvailability`), channels (read-only health), fraud (`listFraudEvents`, `resolveFraudEvent`, `clearFraudFlag`, link to user), **logs** (`admin.listUsageLogs` from B3, filterable — replaces the REST route that returns the latest 200 unfiltered), **audit** viewer (`admin.listAuditLogs`; `audit_logs` is already written by admin actions).
- **Done when:** CI green · preview: every admin page loads in ar+en · logs filter by user/model/date.

**8d Admin settings decision (D7)**
- The old page never persisted anything (F12). Default: **omit** from v2 and record a design note. Only build if B5 (platform settings table + enforcement of maintenance mode / welcome credits in `/chat` and the sign-up hook) is approved.
- **Done when:** decision recorded in `docs/architecture/decisions.md`.

---

### Phase 9 — Hardening, e2e, cutover (3 sessions)

**9.1 Hardening**
- RTL audit of every page at 360 px, tablet and desktop (ar + en). Accessibility: keyboard paths, focus rings, `aria-live` for streaming text, AA contrast in every preset. Performance: measure first-load JS per route with the bundle analyzer, then set budgets; lazy-load shiki, charts, QR. Security headers: add a CSP compatible with Turnstile (today only `X-Frame-Options` / `nosniff`). Review the markdown safety fixtures.
- **Done when:** checklist signed off per page; budgets recorded.

**9.2 E2E + monitoring**
- Playwright critical flows in CI: register→login · redeem · chat stream against a **mock gateway** started in CI (`GATEWAY_URL`) · manual-payment claim→admin approve · admin role guard. Error monitoring (Sentry or similar — an open item in `LAUNCH_CHECKLIST.md`).
- **Done when:** all e2e green in CI three runs in a row.

**9.3 Cutover + cleanup**
- **Cutover:** merge `frontend-v2` → `main`; Vercel production deploy; watch Vercel runtime logs and admin logs for the first hour.
- **Rollback:** Vercel "promote previous deployment" (instant), or revert the merge commit. The frontend changes no schema, and B-PRs are additive, so rollback is safe.
- **Cleanup, one route per commit, only after a repo-wide grep shows zero references:** `/api/admin/users*`, `/api/admin/fraud*`, `/api/admin/stats`, `/api/admin/logs`, `/api/balance`, `/api/transactions` (if replaced by tRPC), any unused session wrapper.
- **Done when:** production smoke test passed · legacy dead code removed · this tracker fully ticked.

---

## 7. Backend track (separate small PRs to `main`, additive only)

Each B session ships: code + Testcontainers tests (the API suite already uses real Postgres) + CI green + deploy to Render **before** the frontend phase that needs it. Run migrations via your existing `DB Migrate` workflow or `AUTO_MIGRATE`.

**B1 — Chat contract** (before 4c)
- Validate `/chat` body with Zod (`model`, `messages` roles/lengths/count, `conversationId` uuid).
- Accept optional `temperature` (0–2), `top_p` (0–1), `max_tokens` (clamped to the model's `maxOutputTokens`), `systemPrompt`; forward to the gateway; persist `systemPrompt` on the conversation (also via `PATCH /api/conversations/[id]`).
- **Idempotent user message (F4):** accept `clientMessageId` (uuid) and a `regenerate` flag; skip the user-row insert if it already exists / on regenerate.
- **Check F5:** bind the upstream fetch to client disconnect; confirm partial billing matches what the user actually received. Add tests.
- Must not break the legacy UI (all new fields optional).

**B2 — User usage + index** (before 6.1)
- Procedures (all `protectedProcedure`, scoped by `ctx.user.id`, range ≤ 90 days, limit ≤ 100): `billing.usageSummary`, `billing.usageTimeseries`, `billing.usageByModel`, `billing.listUsage` (cursor + model/date filters); REST `GET /api/usage/export` (CSV, user-scoped).
- Migration `0009`: `CREATE INDEX idx_transactions_type_date ON transactions(type, created_at DESC)` (F13).
- **Test:** user A can never read user B's usage (IDOR test).

**B3 — Admin logs + audit** (before 8c)
- `admin.listUsageLogs` (filters: user, model, date; cursor) and `admin.listAuditLogs` (filters: admin, action, target, date; cursor), both `adminProcedure`.

**B4 — Hardening extras** (optional, any time before 9.1)
- Turnstile verification inside `submitManualPayment` (gap noted in `PAYMENT_METHODS_PLAN.md`).
- A real `/api/status` (API `/health` + gateway channel health) so `StatusBanner` can return.

**Deferred with a timeline (post-cutover backlog):** platform settings table (B5, F12) · stream protocol v2 with typed events for live cost/reasoning/sources (touches the heart of the product; only after cutover, with mock-upstream tests) · OpenAI-compatible endpoint (F17) · screenshot upload (D8) · Arabic legal documents + lawyer review · admin API keys / provider key manager UI (not in the repo today).

---

## Appendix A — Session kickoff prompt

```
Phase <ID> of docs/FRONTEND_REBUILD_PLAN.md.
Attached: latest repo zip + the plan.
1. Write the 5-point Phase Summary first and wait for my OK.
2. Then deliver a zip of new/changed files at repo-relative paths, a DELETE list,
   and a "How to verify" list (CI jobs, preview URLs, manual checks).
3. Do not touch the frozen zone. If the plan contradicts the code, tell me before building.
4. State anything you could not verify without running the code.
```

## Appendix B — Phase Summary (before any code)

1. **What I'm building** — exact files/components/procedures.
2. **Deviations from the plan** — what and why.
3. **Verification** — the exact CI jobs, tests, preview steps that prove it.
4. **What breaks in production if this is wrong** — the specific table/route/flow and the exact code/constraint/test that prevents it.
5. **Gate check** — prerequisite phases verified? (Phase 0.1: the three legal documents dated and complete.)

## Appendix C — API contract (frozen; verify in 0.3)

**tRPC (`appRouter`, one router shared with Fastify)**
- `billing`: `listPackages` (public) · `listPaymentMethods` (public) · `submitManualPayment` · `myManualPayments` · `getBalance` · `getTransactions {limit≤100, offset}` · `redeemCode`
- `user`: `getProfile · updateProfile · generateApiKey · revokeApiKey · getApiKeyInfo · getReferralStats`
- `models`: `list` (public; id, displayName/Ar, badge, provider, tier, contextWindow, maxOutputTokens, supportsVision, avgResponseTimeMs, creditsPerKInput/Output) · admin: `listAll · pending · sync · publish · toggleAvailability`
- `admin`: `gatewayChannels · getDashboardStats · getRevenueTimeseries · getModelUsageBreakdown · getRecentTransactions · listUsers · getUserDetail · updateUserStatus · adjustCredits · generateCodes · listCodeBatches · codeInventory · revokeCodeBatch · getBatchCodes · revokeCode · listFraudEvents · resolveFraudEvent · clearFraudFlag · listPackages · createPackage · updatePackage · listPaymentMethods · createPaymentMethod · updatePaymentMethod · listManualPayments · approveManualPayment · rejectManualPayment`

**REST (Next.js route handlers)**
- `POST /api/chat` (stream) · `GET|POST /api/conversations` · `GET|PATCH|DELETE /api/conversations/[id]`
- `POST /api/redeem` · `GET /api/balance` · `GET /api/transactions`
- `GET /api/user/sessions` · `DELETE /api/user/sessions/[id]` · `GET /api/user/export-data` · `POST /api/user/delete-account`
- `GET /api/status` (stub) · `GET /api/health` · `POST /api/webhooks/payment` (Moyasar, disabled)
- Legacy admin REST: `users`, `users/[id]`, `users/[id]/credits`, `fraud`, `fraud/[id]/resolve`, `stats`, `logs`, `codes` (removal candidates in 9.3)

**Better Auth client:** `signIn.email · signUp.email · signOut · useSession · requestPasswordReset · resetPassword · verifyEmail · sendVerificationEmail · changePassword · listSessions · revokeSession · revokeOtherSessions · twoFactor.*`

## Appendix D — Legacy behaviours the new UI must keep

Referral capture (`?ref=`) · Turnstile on register + redeem · inline 2FA step at login · theme (light/dark) + language switch · account menu · balance widget with low-balance state · tab-conflict warning · offline banner · IndexedDB conversation cache · token estimate · code-block copy · chat error states · sidebar date grouping · manual-payment claims list · admin: dashboard, users, users/[id], codes, packages, payment-methods, manual-payments, models, channels, fraud, logs · settings: profile, security (password, 2FA, sessions), API key, referral, export, delete account.

## Appendix E — New API reference map (structure only, AGPL — don't copy code)

| Phase | Read in New API |
|---|---|
| 1 | `styles/theme.css`, `theme-presets.css`, `context/theme-*.tsx`, `context/direction-provider.tsx` |
| 2 | `components/layout/components/*`, `components/layout/config/*` |
| 4 | `features/playground/**`, `components/ai-elements/*` (chat pieces only) |
| 5 | `features/wallet/**` |
| 6 | `features/dashboard/**`, `features/usage-logs/**` |
| 7 | `features/system-settings/components/*`, `features/profile/**` |
| 8 | `src/components/data-table/*`, `features/redemption-codes/**`, `features/usage-logs/**` |
