# Architecture Decision Records

## ADR-001: Use New API (Go) as Gateway (not custom)
- **Date:** Project start
- **Decision:** Use calciumion/new-api as the AI gateway
- **Reasoning:** Handles channel failover, token counting, model routing out-of-box.
  Building equivalent from scratch = 4+ weeks. New API = 1 day setup.
- **Trade-off:** Dependency on third-party open-source project.
- **Mitigation:** Monitor repository activity. The gateway is replaceable behind our proxy layer.

## ADR-002: Custom Next.js frontend (not LobeChat/OpenWebUI)
- **Date:** Project start
- **Decision:** Build custom frontend
- **Reasoning:** Arabic RTL, branding, billing UX all require deep control.
  Forking LobeChat = fighting the framework. Custom = full ownership.
- **Trade-off:** More initial build time.
- **Mitigation:** shadcn/ui + Tailwind make custom UI fast to build.

## ADR-003: Credits stored as micro-integers (not floats)
- **Date:** Project start
- **Decision:** Store all credits as bigint micro-units (1 credit = 1,000,000 micro)
- **Reasoning:** Floating point arithmetic in billing is dangerous.
  0.1 + 0.2 = 0.30000000000000004 in JavaScript.
- **Trade-off:** Extra conversion logic for display.
- **Mitigation:** formatCredits() utility handles display everywhere.

## ADR-004: Redeem codes with checksum (not pure random)
- **Date:** Project start
- **Decision:** Last 4 chars of code are HMAC-SHA256 checksum of body
- **Reasoning:** Eliminates ~97% of brute-force DB hits.
  Format validation before hitting database.
- **Trade-off:** Slightly more complex code generation.
- **Mitigation:** generateCode() and validateCodeFormat() utilities encapsulate this.

## ADR-005: Caddy over Nginx as reverse proxy
- **Date:** Project start
- **Decision:** Use Caddy v2 for reverse proxy and SSL
- **Reasoning:** Automatic Let's Encrypt with zero configuration.
  HTTP/3 support. Simpler config syntax. No certbot cron needed.
- **Trade-off:** Less documentation than Nginx online.
- **Mitigation:** Caddyfile is well-documented in this codebase.

## ADR-006: Valkey over Redis
- **Date:** Project start
- **Decision:** Use Valkey (Redis fork) instead of Redis
- **Reasoning:** Redis changed license to SSPL (not truly open source).
  Valkey = Apache 2.0, API-compatible drop-in replacement.
- **Trade-off:** Newer project, less ecosystem tooling.
- **Mitigation:** 100% API compatible. Can switch back to Redis if needed.

## ADR-007: Payment methods and packages as relational data (not static config)
- **Date:** Payment phase, pivot to Yemen market
- **Decision:** Moyasar/SAR disabled (not removed). Active payment
  methods are Jaib (pre-uploaded voucher codes via tabweeb.com.ye, no
  API) and manual wallet transfer, both YER-priced. Packages and
  payment methods move to DB tables instead of static config; a code
  batch is tagged with both. See `docs/PAYMENT_METHODS_PLAN.md` for the
  full plan — full detail lives there, not here.
- **Reasoning:** No major Yemeni wallet publishes a public checkout API.
  The redeem-code system already built is channel-agnostic and reusable
  as-is; only tracking needed a relational shape.
- **Trade-off:** More schema than a static config, but packages become
  editable from the admin UI without a deploy.
- **Mitigation:** `redeemCode()`/`generateCode()` security and
  redemption logic (ADR-004) is completely unchanged by this — only
  generation-time tagging is new.

## ADR-008: Manual-transfer claims credit directly, not via a redeem code
- **Date:** Payment phase, Yemen market
- **Decision:** When an admin approves a `pending_manual_payments` claim,
  `manual-payment.service.ts` calls `creditBalance()` directly (type
  `"payment"`, `paymentId` = the claim's id). It does **not** claim a
  pre-generated `redeem_codes` row the way Jaib fulfillment does.
- **Reasoning:** `PAYMENT_METHODS_PLAN.md` §3 frames both payment methods
  as funneling into "the redeem-code system," which is true for Jaib
  (tabweeb hands the buyer an actual code) but manual transfer never
  issues the buyer a code at all — §7.10 describes a claim-submission +
  admin-approval queue instead. Requiring admins to keep a manual-transfer
  code batch pre-generated and in stock just so approval could "redeem"
  one adds an out-of-stock failure mode to a channel whose entire point is
  human verification, for no benefit — the claim row itself, plus the
  admin's identity and timestamp on `reviewed_by_admin_id`/`reviewed_at`,
  is already a complete audit trail.
- **Trade-off:** Two slightly different mechanisms for "payment method"
  instead of one uniform one.
- **Mitigation:** Both still terminate in the exact same atomic ledger
  function (`creditBalance()`) and produce a `transactions` row — Prompt.md
  rule 4 ("every credit movement is a transactions row") holds for both.
  `redeemCode()`/`generateCode()` (ADR-004) remain completely untouched by
  the manual-transfer path, which was the actual guarantee ADR-007 cared
  about preserving.

## ADR-009: Referral bonus fires on first payment, not signup; capture lives in `create.after`, not `create.before`
- **Date:** Referral program phase
- **Decision:** `referral.service.ts`'s `maybeAwardReferralBonus()` is
  called from inside `redeemCode()`'s and `approveManualPayment()`'s
  transactions — i.e. the moment a referred user's first real credit
  grant lands — never from the signup hook itself. A new
  `users.referral_bonus_awarded_at` column (nullable, set once) is the
  atomic idempotency guard: `UPDATE users SET referral_bonus_awarded_at
  = now() WHERE id = $referred AND referred_by_user_id IS NOT NULL AND
  referral_bonus_awarded_at IS NULL`, same shape as `redeemCode()`'s
  status flip and `approveManualPayment()`'s pending→approved flip.
  Separately: the new user's own `referralCode` and their
  `referredByUserId` (resolved from an `x-referral-code` header, same
  header-based trick as `x-turnstile-token` since better-auth's sign-up
  schema doesn't accept arbitrary extra body fields) are both written in
  `databaseHooks.user.create.after` in apps/web/lib/auth.ts — right next
  to, and in the same style as, the existing balances-row creation — NOT
  in `create.before`'s documented `{ data: {...} }` return.
- **Reasoning (bonus timing):** Awarding on signup alone is a well-known
  abuse pattern — create N throwaway accounts via your own referral
  link, collect N bonuses, contribute zero real revenue. Gating on
  "referred user's first payment" means a payout only ever follows money
  actually entering the ledger.
- **Reasoning (`after` vs `before`):** better-auth's `create.after` hook
  has a documented FK-constraint timing bug (better-auth#7260) — but only
  for social-login/OAuth signups, where the hook can run before the
  triggering transaction is fully committed. This app is email/password
  only, and `create.after` already reliably creates the `balances` row
  for every signup (proven, working code, not new to this change) — so
  extending that exact same hook to also write `referralCode`/
  `referredByUserId` via a plain `db.update(users)...where(eq(users.id,
  user.id))` reuses a mechanism already known to work here, rather than
  introducing `create.before`'s different, untested-in-this-codebase
  `{ data }`-merge contract for the same result.
- **Trade-off:** A referrer doesn't see their bonus land immediately when
  a friend signs up — only after that friend actually pays. Slower
  gratification, but the alternative is a directly farmable free-credit
  faucet.
- **Mitigation:** The award call sits inside the SAME database
  transaction as the qualifying credit grant (`tx` passed through, exactly
  like `creditBalance()`'s own nesting pattern) — if anything in that
  transaction rolls back, the bonus never fires as a half-applied side
  effect. The referral-capture block in `create.after` is wrapped in its
  own try/catch that can never block a real signup over a bad/missing
  header or a lookup hiccup — the balances insert above it is
  unconditional and always runs first.

## ADR-010: Admin "Settings" page omitted from v2 (D7)
- **Date:** Phase 8d
- **Decision:** The v2 admin panel has no Settings page. There is no
  `/admin/settings` route, no `adminSettings` entry in
  `apps/web/config/nav.ts`, and no settings procedures. The legacy page is
  removed as part of the 9.3 cleanup, not rebuilt.
- **Reasoning:** The legacy page (finding F12) kept every value in local
  `useState` — nothing persisted, and no settings table or procedure
  exists. Controls like "maintenance mode" or "welcome credits" were
  never enforced anywhere: `/chat` and the sign-up hook do not read them.
  A page that looks like it works but changes nothing is worse than no
  page — during an incident an admin could flip "maintenance mode" and
  believe traffic was blocked.
- **Trade-off:** Admins cannot change platform-wide behaviour from the UI;
  those remain code/env changes (`apps/api/src/config.ts`, deploy env).
- **Mitigation / revisit trigger:** Backlog item B5 — a `platform_settings`
  table, admin procedures with audit-log rows, and enforcement in `/chat`
  (maintenance mode) and the sign-up hook (welcome credits), all with
  Testcontainers tests. Only after B5 is approved does a Settings page come
  back, post-cutover. Until then no UI may present a setting that the
  backend does not read.
