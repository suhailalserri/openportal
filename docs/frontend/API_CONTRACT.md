# API Contract — frozen zone (verified 2026-09-19, Phase 0.3)

This documents the actual code in `apps/api/src` and `apps/web/app/api` +
`apps/web/server` as of the zip reviewed in this session. It supersedes
Appendix C of `docs/FRONTEND_REBUILD_PLAN.md`, which was a name list only.
Anything in this file that contradicts the plan body (F1–F18) is the plan
being imprecise, not the code being wrong — the code is ground truth.

Do not hand-edit this file without re-reading the source; it is meant to be
regenerated (or at least re-diffed) whenever the frozen zone changes.

---

## 1. tRPC (`appRouter`, `apps/api/src/routers/index.ts`)

One router, shared by both hosts: `apps/api` (Fastify, mounted as the New
API-adjacent service) and `apps/web` (`app/api/trpc/[trpc]/route.ts`, via
`server/router.ts`'s re-export). There is exactly one implementation —
nothing is duplicated between the two hosts.

Access levels come from `routers/trpc.ts`:
- **public** — `t.procedure`, no session required.
- **protected** — throws `UNAUTHORIZED` if `ctx.user` is null.
- **admin** — throws `UNAUTHORIZED` if no session, `FORBIDDEN` unless
  `ctx.user.role` is `admin` or `superadmin`.

`ctx.user` is resolved by reading the `sessions` table directly by
**token** (not `id` — see the comment in `trpc.ts`), matched against the
`better-auth.session_token` cookie or an `Authorization: Bearer` header.
`ctx.ip` reads `cf-connecting-ip` → `x-forwarded-for` → `req.ip` → `"unknown"`.

### `billing` (7 procedures)

| Procedure | Access | Input (Zod) | Notes |
|---|---|---|---|
| `listPackages` | public | — | Active `creditPackages`, sorted by `sortOrder`. |
| `listPaymentMethods` | public | — | Active `paymentMethods`, sorted by `sortOrder`. |
| `submitManualPayment` | protected | `{ packageId: uuid, paymentMethodId: uuid, submittedTxRef?: string(≤150), senderPhone?: string(≤30), senderName?: string(≤100), screenshotUrl?: url(≤2048), notes?: string(≤1000) }` | Three in-process rate-limit gates before the DB call: per-user/hour, per-user/day, per-IP/hour (`FRAUD.MANUAL_PAYMENT_ATTEMPTS_*`, see §4). Each trip logs a `fraud_events` row (`SUSPICIOUS_PATTERN`) and throws `TOO_MANY_REQUESTS`. On business-logic failure throws `BAD_REQUEST` with the service's Arabic message. |
| `myManualPayments` | protected | `{ limit?: 1–50, default 20 }` | User's own claims only. |
| `getBalance` | protected | — | Returns `{ credits, totalSpent, totalRedeemed, displayCredits }`; zeros if no balance row exists yet. |
| `getTransactions` | protected | `{ limit?: 1–100 default 20, offset?: number default 0 }` | Returns `{ items, hasMore }`. |
| `redeemCode` | protected | `{ code: string(1–32) }` | **Not the live UI path** (see §3 `/api/redeem`). Runs `FraudService.checkRedeemAttempt` (Redis-backed) inside `redeemCode()` itself. Throws `BAD_REQUEST` on failure. |

### `user` (6 procedures)

| Procedure | Access | Input | Notes |
|---|---|---|---|
| `getProfile` | protected | — | Strips `passwordHash`, `apiKeyHash`, `twoFactorSecret` from the returned row. |
| `updateProfile` | protected | `{ displayName?: string(1–100), locale?: "ar"\|"en" }` | Partial update. |
| `generateApiKey` | protected | — | Rate-limited: `FRAUD.SENSITIVE_ACTION_PER_HOUR` (10/hr) via `checkLimit`. Key format `sk-aip-{72 hex chars}`, hashed with **SHA-256** (not bcrypt — see inline comment: the lookup is by-value equality, which bcrypt's salting makes impossible). Raw key returned once. |
| `revokeApiKey` | protected | — | Clears hash + prefix. |
| `getApiKeyInfo` | protected | — | `{ prefix, hasKey }`, no secret material. |
| `getReferralStats` | protected | — | Delegates to `referral.service.ts`. |

**Not present:** any password-change mutation here. Password changes go
through `authClient.changePassword()` (Better Auth, §5) — a previous tRPC
`changePassword` compared against `users.passwordHash`, which Better Auth's
credential strategy never writes to (see `packages/db/src/schema/users.ts`
comment); that mutation has been removed, not merely deprecated.

### `models` (6 procedures)

| Procedure | Access | Input | Notes |
|---|---|---|---|
| `list` | public | — | Only `status="published" AND isAvailable=true` rows. This table — not New API, not a static catalog — is the single source of truth for what the chat UI may render. Returns per-model `creditsPerKInput`/`creditsPerKOutput`, pre-computed server-side from wholesale cost × markup. |
| `listAll` | admin | — | Every row, any status. |
| `pending` | admin | — | `status="pending"` only — the sync-discovery queue. |
| `sync` | admin | — | Mutation. Pulls the gateway's model list, diffs against this table, never auto-publishes. Throws `BAD_GATEWAY` on failure. |
| `publish` | admin | `{ modelId, displayName(1–100), displayNameAr(1–100), badge?(≤10), tier: "standard"\|"premium" default "standard", markupMultiplier: positive default 2.0, contextWindow: positive int, maxOutputTokens: positive int, supportsVision: bool default false, wholesaleCostInputPerM?: ≥0 default 0, wholesaleCostOutputPerM?: ≥0 default 0, rateLimitPerUserDaily?: positive int }` | Sets `status="published", isAvailable=true`. `NOT_FOUND` if `modelId` doesn't exist. |
| `toggleAvailability` | admin | `{ modelId, isAvailable: bool }` | `NOT_FOUND` if missing. |

### `voice` (3 procedures, P5.3)

All **protected**. Same host rule as `attachments`: they work only on the api host (Render); through `/api/trpc` they answer `SERVICE_UNAVAILABLE` / `STORAGE_DISABLED`. Errors carry a stable code in `message` (do not reword); the frontend maps it to copy. Flow: `createUploadUrl` -> PUT the recording to `uploadUrl` -> `confirm` -> `transcribe`. A voice note belongs to no conversation, so it works in a brand-new chat.

| Procedure | Input | Returns / notes |
|---|---|---|
| `voice.createUploadUrl` | `{ mimeType, sizeBytes }` (audio/webm, ogg, mp4, mpeg, wav; 1 byte to 15 MiB; parameters such as `;codecs=opus` are fine) | `{ audioId, uploadUrl, mimeType, maxBytes }`. `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS` (`QUOTA_DAILY` 100 voice notes/24 h, `QUOTA_BYTES`). |
| `voice.confirm` | `{ audioId }` | `{ audioId, sizeBytes }`. `NOT_FOUND` (`OBJECT_NOT_FOUND`) if the PUT did not land or it is not yours. |
| `voice.transcribe` | `{ audioId, durationMs?, language? }` (`durationMs` = MediaRecorder timing, max 300,000 accepted for billing; `language` = two-letter hint such as `ar`/`en`) | `{ text, seconds, creditsCharged, modelId }`. `text` is for an **editable composer; never auto-send it**. `creditsCharged` is in micro-credits. **Billed**; the recording is deleted afterwards. |

`voice.transcribe` errors (message codes): `INSUFFICIENT_BALANCE` (`PRECONDITION_FAILED`; nothing was sent to the provider, or the final deduction was refused and the text withheld), `REQUEST_IN_PROGRESS` (`CONFLICT`; another billed operation of yours is running, retry in a moment), `BILLING_LOCK_UNAVAILABLE` (`SERVICE_UNAVAILABLE`), `AUDIO_NOT_FOUND` (`NOT_FOUND`; missing, foreign, unconfirmed or already transcribed), `AUDIO_TOO_LONG` (`PAYLOAD_TOO_LARGE`; over 5 minutes), `AUDIO_UNUSABLE` (`BAD_REQUEST`; the provider could not decode it, the recording is deleted), `TRANSCRIPTION_UNAVAILABLE` (`SERVICE_UNAVAILABLE`; provider down, **not billed**, the same `audioId` can be retried), `TRANSCRIPTION_FAILED` (`BAD_GATEWAY`; not billed), `TRANSCRIPTION_NOT_CONFIGURED` (`SERVICE_UNAVAILABLE`; no priced speech model; the mic button should be hidden or disabled). An empty `text` means silence; it is still billed. Speech models never appear in `models.list` and `/chat` answers `404 MODEL_NOT_FOUND` for them.

### `attachments` (3 procedures, P5.2a)

All **protected**. Work only on the api host (Render): the Supabase service key is not on Vercel, so through `/api/trpc` they answer `SERVICE_UNAVAILABLE` with message `STORAGE_DISABLED`. Errors carry a stable code in `message` (do not reword); the frontend maps it to copy. `/chat` accepts `attachmentIds` since P5.2b (see section 3).

| Procedure | Input | Returns / notes |
|---|---|---|
| `createUploadUrl` | `{ conversationId: uuid, fileName(1–255), mimeType(1–100), sizeBytes: int 1–20971520 }` | Mutation. `{ attachmentId, uploadUrl, mimeType, maxBytes, kind: "image"\|"document", fileName }`. Browser PUTs the file to `uploadUrl`. Errors: `INVALID_MIME` (415), `FILE_TOO_LARGE` (413), `QUOTA_BYTES` / `QUOTA_DAILY` (429), `CONVERSATION_NOT_FOUND` (404), `UPSTREAM` (502). |
| `confirm` | `{ attachmentId: uuid }` | Mutation, idempotent. Verifies the upload and queues extraction. Returns the attachment view (status `processing`). Errors: `NOT_FOUND`, `OBJECT_NOT_FOUND` (nothing uploaded yet), `QUEUE_UNAVAILABLE` (retry). |
| `get` | `{ attachmentId: uuid }` | Query. `{ id, conversationId, fileName, mimeType, sizeBytes, kind, status: "uploading"\|"processing"\|"ready"\|"failed", errorCode, textChars, truncated, preview(≤300 chars), createdAt }`. Poll until `ready`/`failed`. Never returns the full extracted text. Foreign id = `NOT_FOUND`. |

`errorCode` when `failed`: `TYPE_MISMATCH`, `CORRUPT`, `NO_TEXT`, `TOO_COMPLEX`, `TIMEOUT`, `MEMORY`, `DOWNLOAD_FAILED`, `EXTRACT_FAILED`, `OBJECT_DELETED`, `STALLED`. Details: `docs/runbooks/ATTACHMENTS.md`.

### `admin` (27 procedures)

All `adminProcedure`. Money/state-changing ones write an `auditLogs` row
(`adminId`, `action`, `targetType`, `targetId`, `before`/`after`, `ip`).

**Dashboard / gateway**
- `gatewayChannels` — query. Proxies New API's channel-list admin endpoint using `GATEWAY_ROOT_TOKEN`. Throws `BAD_GATEWAY` with the raw error string on failure (see inline comment: some New API deployments expect this token as a plain admin token for `/api/*`, not just the OpenAI-style key for `/v1/*` — a wrong token surfaces as unauthorized here).
- `getDashboardStats` — query, no input.
- `getRevenueTimeseries` — `{ days: 1–90 default 14 }`.
- `getModelUsageBreakdown` — `{ days: 1–90 default 7 }`.
- `getRecentTransactions` — `{ limit: 1–100 default 20 }`.
  All four of the above wrap their service call and rethrow as `INTERNAL_SERVER_ERROR` **with the original driver/service error message inlined** — deliberate, so a Postgres error is visible client-side without needing server log access.

**Users**
- `listUsers` — `{ limit default 50, offset default 0, search?: string }`. Excludes `passwordHash`/`apiKeyHash`/`twoFactorSecret` columns at the query level.
- `getUserDetail` — `{ userId: uuid }`. Returns `{ user, balance, recentTxns(20) }`. `NOT_FOUND` if missing.
- `updateUserStatus` — `{ userId: uuid, status: "active"\|"suspended", reason?: string }`. Audit-logged.
- `adjustCredits` — `{ userId: uuid, amount: int, type: "admin_credit"\|"admin_debit", reason: string(min 1) }`. `amount` is always treated as a positive magnitude via `Math.abs` — `type` alone decides direction (guards against a negative amount flipping the operation). Debit path uses `deductCreditsAtomic`; throws `BAD_REQUEST` if it would take the balance negative.

**Redeem codes**
- `generateCodes` — `{ count: 1–1000, creditValue: int ≥1, label: string(1–100), expiresAt?: ISO datetime, packageId?: uuid, paymentMethodId?: uuid }`. If `packageId` is given, `creditValue`/`faceValue` are **derived from the package** server-side (client-sent values for those fields are display/audit-snapshot only, never trusted for the actual credit amount). Returns `{ batchId, codes: string[], count }` — the plaintext codes, once.
- `listCodeBatches` — query, no input. Aggregates (`total`, `used`, `expired`) grouped by batch.
- `codeInventory` — `{ lowStockThreshold: int ≥0 default 20 }`. Grouped by `(paymentMethodId, packageId)`, only rows where both are non-null.
- `revokeCodeBatch` — `{ batchId: uuid }`. Only flips `status="unused"` rows to `"revoked"` (already-used/expired codes are untouched).
- `getBatchCodes` — `{ batchId: uuid }`. `NOT_FOUND` if the batch has zero rows.
- `revokeCode` — `{ code: string }`. Same unused-only guard as the batch version.

**Fraud**
- `listFraudEvents` — `{ resolved: bool default false, limit default 50 }`.
- `resolveFraudEvent` — `{ eventId: uuid }`.
- `clearFraudFlag` — `{ userId: uuid }`. Clears `isFraudFlagged`/`fraudReason` on the user row; audit-logged.

**Packages** (`PAYMENT_METHODS_PLAN.md` §7.3)
- `listPackages` — query, all rows (admin view, unlike billing's active-only).
- `createPackage` — `{ name(1–100), nameAr(1–100), priceYer: positive int, priceUsdEquivalent: positive, credits: positive int (display units — ×1,000,000 stored), description?(≤1000), descriptionAr?(≤1000), sortOrder default 0 }`.
- `updatePackage` — same shape, all fields optional except `id: uuid`. `NOT_FOUND` if missing.

**Payment methods** (§7.4)
- `listPaymentMethods` — query, all rows.
- `createPaymentMethod` — `{ name(1–100), nameAr(1–100), type: "jaib_voucher"\|"manual_transfer", logoUrl?(url≤2048), accountCode?(≤100), instructions?(≤2000), instructionsAr?(≤2000), sortOrder default 0 }`.
- `updatePaymentMethod` — same shape, all optional except `id: uuid`. `NOT_FOUND` if missing.

**Manual-payment approval queue** (§7.10)
- `listManualPayments` — `{ status: "pending"\|"approved"\|"rejected" default "pending", limit: 1–100 default 50 }`. Left-joins user/package/method for display fields (no `relations()` config exists in this schema — every admin list does manual joins, not `with`).
- `approveManualPayment` — `{ claimId: uuid }`. `BAD_REQUEST` on service failure; audit-logged on success.
- `rejectManualPayment` — `{ claimId: uuid, reason: string(1–500) }`. Same pattern.

**Total: 7 + 6 + 6 + 27 = 46 procedures**, matching the plan's Appendix C count. Every name above was checked 1:1 against the router source; none are renamed or missing on either side.

---

## 2. REST (`apps/web/app/api/**`, Next.js route handlers)

All routes below call `auth.api.getSession({ headers })` directly (not
tRPC's context) and return `401` inline if there's no session — they do
**not** go through `middleware.ts`'s guard, so a route added here without
its own session check is unauthenticated by default.

| Route | Methods | Auth | Body / params | Notes |
|---|---|---|---|---|
| `/api/chat` | `POST` | session (401 if none) | `{ model, messages, conversationId? }` — **no Zod validation, a bare `as` cast** (F2, confirmed) | Proxies to `${INTERNAL_API_URL}/chat` with `Authorization: Bearer ${INTERNAL_SERVICE_TOKEN}`, `X-User-ID`, `X-User-Email`. Fails loudly (500 `CONFIG_ERROR`) if `INTERNAL_API_URL` unset, rather than defaulting to a Compose-internal hostname. 502 `UPSTREAM_UNREACHABLE` / `UPSTREAM_ROUTE_NOT_FOUND` on connect/404. Streams `upstream.body` through as-is; **response is `text/plain`, not SSE/JSON** — see §3. |
| `/api/conversations` | `GET`, `POST` | session | — | `GET` returns the caller's non-deleted conversations, limit 50, `updatedAt DESC`. `POST` creates an empty conversation row and returns it. |
| `/api/conversations/[id]` | `GET`, `PATCH`, `DELETE` | session | `PATCH: { title?, isPinned? }` | All three scope by `and(id, userId)` — cannot touch another user's conversation, returns `404`/no-op rather than leaking existence. `DELETE` is a soft-delete (`deletedAt`). |
| `/api/redeem` | `POST` | session | `{ code: string(1–32), turnstileToken?: string }` (Zod) | **This is the live redeem path** the UI should call, not `billing.redeemCode`. Per-user hour/day `checkLimit` gates (`FRAUD.REDEEM_ATTEMPTS_PER_HOUR/DAY`) return `200` with `{ success:false, error:"TOO_MANY_ATTEMPTS"\|"DAILY_LIMIT_REACHED" }` (not a 4xx status) before Turnstile is even checked. Then Turnstile verification (`CAPTCHA_FAILED` on failure), then `redeemCode()` itself (which also runs the Redis-backed fraud check). |
| `/api/balance` | `GET` | session | — | `{ credits }` only — no `totalSpent`/`totalRedeemed` (unlike `billing.getBalance`). |
| `/api/transactions` | `GET` | session | query `?limit&offset` | `limit` capped to 100 server-side via `Math.min`; note `hasMore` compares against the **raw requested `limit`**, not the capped one — if `limit > 100` is requested, `hasMore` can be wrong. |
| `/api/user/sessions` | `GET`, `DELETE` | session | — | Reads the `sessions` table **directly**, not `authClient.listSessions()` — deliberate, see inline comment: Better Auth's own `listSessions()` blanks the `token` field for every session except the current one, and `revokeSession` only accepts a token, making per-device revoke impossible to build on their client API alone. `GET` returns `{ sessions: [{ id, ip, userAgent, createdAt, updatedAt, expiresAt, current }] }`. `DELETE` (collection route) deletes every session **except** the caller's current one ("log out other devices"). |
| `/api/user/sessions/[id]` | `DELETE` | session | — | Revokes one specific session by its **row id** (never the token). Refuses (`400 CANNOT_REVOKE_CURRENT_SESSION`) if `id` is the caller's own current session. `404 NOT_FOUND` if the row doesn't exist or belongs to someone else — same response either way, so this can't be used to probe other users' session ids. |
| `/api/user/export-data` | `GET` | session | — | Rate-limited (`SENSITIVE_ACTION_PER_HOUR`, 429 on trip). Returns a downloadable JSON attachment: profile (safe columns only), balance, full transaction history, conversation **metadata** (no message bodies). |
| `/api/user/delete-account` | `POST` | session | `{ password?: string, confirmed?: boolean }` (Zod, both optional — one or the other required depending on account type) | Rate-limited. **Anonymizes in place, does not hard-delete** — `transactions.userId` has no cascade, so a real `DELETE FROM users` would foreign-key-violate for any account that ever transacted. Password-auth accounts verify via `auth.api.verifyPassword` (`400 PASSWORD_REQUIRED`/`INCORRECT_PASSWORD`); OAuth-only accounts require `confirmed:true` instead (`400 CONFIRMATION_REQUIRED`). On success: email scrubbed to `deleted-{id}@deleted.invalid`, PII nulled, all `accounts`/`twoFactor`/`sessions` rows deleted, `status="suspended"`. Balances/transactions/conversations rows are untouched. |
| `/api/status` | `GET` | none | — | **Stub** (F11, confirmed): always returns `{ overall: "healthy", services: [] }` regardless of actual state. `StatusBanner` reading this is decorative until B4. |
| `/api/health` | `GET` | none | — | `{ status: "ok", timestamp }`. |
| `/api/webhooks/payment` | `POST` | HMAC signature (`moyasar-signature` header vs `MOYASAR_WEBHOOK_SECRET`) | Moyasar event JSON | **Disabled via `FEATURE_FLAGS.MOYASAR_ENABLED`** — returns `410` immediately unless flipped on (ADR-007). Code path is otherwise intact (idempotent on `transactions.paymentId`) for a future Moyasar relaunch. Not the live payment flow — see `PAYMENT_METHODS_PLAN.md` / Jaib+manual-transfer via `submitManualPayment`. |
| `/api/auth/[...all]` | `GET`, `POST` | n/a (Better Auth's own handler) | — | `toNextJsHandler(auth)` — every Better Auth endpoint (`sign-in`, `sign-up`, `verify-email`, `change-password`, `list-sessions`, `revoke-session`, 2FA, etc.) lives under this one catch-all. Not previously listed in Appendix C. |
| `/api/trpc/[trpc]` | `GET`, `POST` | per-procedure (see §1) | — | `fetchRequestHandler` mount for `appRouter`. `onError` **always logs server-side now** (previously gated to non-production, which meant Vercel — always `NODE_ENV=production` — silently dropped every tRPC error from Runtime Logs). Not previously listed in Appendix C as an explicit route. |

### Legacy admin REST (DELETED in P3.5)

The eight `/api/admin/**` routes (users, users/[id], users/[id]/credits, stats, fraud, fraud/[id]/resolve, logs, codes) were removed on 2026-09-30: nothing called them, they checked only the role (bypassing the admin 2FA gate), and the credits route was not atomic. Use the tRPC `admin.*` procedures. `apps/api/src/security/rest-admin-guard.test.ts` keeps the directory from coming back ungated.

---

### Voice input over HTTP (P6.3b: the browser's path to `voice.*`)

`voice.*` works only on the api host, and the api's tRPC context accepts a user only from the session cookie or a Bearer session token, so the browser cannot call it directly without holding a session token in JavaScript. Instead the web app proxies to thin Fastify routes that run behind `authMiddleware` (internal service token + `X-User-ID`) and call the same procedures in-process (`apps/api/src/services/voice-http.ts`). No procedure, schema, quota or billing rule is duplicated.

| Browser calls (web proxy, session cookie) | Api route | Does |
|---|---|---|
| `GET /api/voice/status` | `GET /voice/status` | `{ available }`: storage configured and a published speech model exists. The mic is shown only when `true`. |
| `POST /api/voice/upload-url` | `POST /voice/upload-url` | `voice.createUploadUrl` |
| (browser) `PUT <uploadUrl>` | storage, directly | the recording; never through Vercel or the api |
| `POST /api/voice/confirm` | `POST /voice/confirm` | `voice.confirm` |
| `POST /api/voice/transcribe` | `POST /voice/transcribe` | `voice.transcribe` (**billed**) |

Errors: `{ "error": "<CODE>", "message": "<CODE>" }`, same stable codes as the table above, plus `VALIDATION_ERROR` (400, a body the procedure's schema rejected), `INTERNAL_ERROR` (500, nothing leaked), `UNAUTHORIZED` (401), `NOT_FOUND` (404, unknown action or wrong method), `UPSTREAM_UNREACHABLE` (502, proxy could not reach the api). `INSUFFICIENT_BALANCE` is HTTP **402** here, like `/chat`. All responses are `Cache-Control: no-store`. The proxy forwards only these four actions, a JSON body of at most 8 KB, and never copies upstream headers.

## 3. Chat stream contract (F2–F5, re-verified against `gateway.service.ts`)

- **Request:** `POST /chat` (Fastify) body is validated by `chatRequestSchema` (`apps/api/src/schemas/chat.schema.ts`, B1) — a failure is `400 { error: "VALIDATION_ERROR", message, details }`. Fields: `model` (required), `messages` (1–500, roles `user|assistant|system`, content ≤ 200,000 chars), and **all-optional**: `conversationId` (uuid; defaults to a fresh UUID), `temperature` (0–2), `top_p` (0–1), `max_tokens` (positive int, ≤ 1,000,000, then clamped to the model's `maxOutputTokens` server-side), `systemPrompt` (≤ 20,000 chars), `clientMessageId` (uuid), `regenerate` (boolean). **Optional means `undefined`, never `null`** — the schema is `.optional()`, not `.nullable()`, so a literal `null` on the wire is a 400; omit the key instead. *(Corrected in 4c: this bullet previously described the pre-B1 bare-`as`-cast behavior.)*
- **Attachments (P5.2b, optional):** `attachmentIds: uuid[]` (1–5, no duplicates). When present, `conversationId` is **required** and the last message must be `role: "user"` (else `400 VALIDATION_ERROR`). The server checks each id (yours, in this conversation, `ready`) and answers, before anything is saved or billed: `404 ATTACHMENT_NOT_FOUND` (missing, foreign or other conversation, indistinguishable), `409 ATTACHMENT_NOT_READY`, `400 VISION_NOT_SUPPORTED` (image on a model without vision), `400 ATTACHMENT_UNSUPPORTED` (audio, image over 5 MiB / 8,000 px / 40 MP, bytes not the declared type), `400 TOO_MANY_ATTACHMENTS`, `400 CONTEXT_TOO_LONG` (no room left for the document). Each has an Arabic `message`. Document text is sent to the provider in a delimited untrusted block inside the last user message; images as `image_url` data URLs with metadata stripped. **The saved user message is only the typed text.** A file is used only in the request that carries its id: to ask a follow-up about it, send the id again (it is billed again as prompt tokens). The client's context-length mirror does not know about attachment size; the server is the authority (it cuts document text to fit and says so to the model). Response stream and billing are unchanged.
- **Auth/gates before streaming starts:** Fastify `authMiddleware` → `rateLimitMiddleware` → balance check (`credits <= 0` → `402 INSUFFICIENT_BALANCE`) → **per-user billing lock (P1.2; see next bullet)** → model must be `status="published" AND isAvailable=true` (`404 MODEL_NOT_FOUND`) → token-estimate vs `contextWindow * 0.95` (`400 CONTEXT_TOO_LONG`). The estimate is `Math.ceil(len/4)` over `[systemPrompt, ...messages.map(m => m.content)]` (empties dropped) **joined with a single space**, compared with strict `>` — the client mirrors this exactly in `features/chat/lib/context-estimate.ts`, so "Send disabled" and the server's 400 cannot disagree.
- **Response shape (v1, the default):** `Content-Type: text/plain; charset=utf-8`. **Not SSE, not JSON** — raw content-delta bytes only, nothing else reaches the client (no reasoning, sources, usage, or cost events). This is deliberate: the client's `useChat` is configured `streamProtocol: "text"`, so forwarding the gateway's raw OpenAI-format SSE (as an earlier version did) parses as nothing and looks like "connection interrupted" on every response, successful or not.
- **Structured stream, v2 (P6.1, opt-in):** send `Accept: application/vnd.aip.stream+v2` (exact media type, `q` > 0). `/api/chat` (the web proxy) forwards `Accept` upstream **only** for that exact type, so a browser can negotiate it; any other Accept (none, `*/*`, `text/plain`, an unknown vendor type) gets v1 unchanged. Response is `Content-Type: text/event-stream; charset=utf-8`, one SSE frame per event: `event: <type>` + one `data: <json>` line + blank line. Anthropic-Messages style; types in `packages/types/src/stream.types.ts`. Order: `message_start {message:{id (= gateway request id), model, role:"assistant"}}` -> zero or more blocks `content_block_start {index, contentBlock:{type}}`, `content_block_delta {index, delta:{type:"text_delta", text}}`, `content_block_stop {index}` (one block open at a time) -> optional `status` (before the first block only) and `error {code, message}` -> `message_delta {delta:{stopReason:"end_turn"|"interrupted"|"tool_use"}, usage:{inputTokens, outputTokens, creditCost}}` -> `message_stop`. `message_stop` is always the last event and is sent exactly once, including after an interrupted upstream (then `error.code = "STREAM_INTERRUPTED"`, `stopReason = "interrupted"`, and the partial answer is still billed once). `creditCost` is in micro-credits: what this turn is charged (0 when nothing is billed). **P6.2 (provider normalization):** besides `text`, the stream now carries `thinking` blocks (`delta:{type:"thinking_delta", thinking}`, from the provider's `reasoning_content` / `reasoning`) and `tool_use` blocks (`contentBlock:{type:"tool_use", id, name}`, arguments as `delta:{type:"input_json_delta", partialJson}` fragments; concatenate the fragments of one block and `JSON.parse` once at `content_block_stop`; parallel calls are separate blocks, one after another). A block never changes kind: when the model switches between reasoning, text and tool calls, the open block is stopped and a new one starts. `stopReason` can also be `"tool_use"` (the model stopped to call tools; **nothing executes tools yet**, and the request does not offer any, so today this only appears if the gateway returns tool calls on its own). **`status` event:** `{type:"status", code:"waiting"}`, sent at most once, only before the first block, when the provider has accepted the request but produced no output for about 2 s. It is an honest "still working" signal, never reasoning; show your own wording for the code. It cannot fire before the provider accepts the request (that wait is unchanged, and pre-stream failures are still plain JSON). Reasoning and tool arguments count as output tokens in the `usage` fallback estimate. `tool_result` and `attachment_ref` are defined but not emitted yet. Whether reasoning or tool calls appear at all depends on the model and on what the gateway forwards; a model that hides its reasoning simply produces no `thinking` block. v1 is unaffected: it still receives text only. Failures **before** the first byte (401, 402, 404, 409, 429, 502, ...) are unchanged plain JSON with a non-2xx status in both versions; once `message_start` is written the status is 200 and problems arrive as `error` events. Unknown event types must be ignored by clients. The v1 UI (`useChat` text protocol) does not send the header and is unaffected.
- **Parsing on the server side:** upstream SSE (`data: {...}` lines) is buffered until a complete line is available before `JSON.parse`, specifically to avoid a chunk boundary splitting the `usage` object mid-JSON (confirmed as a real prior bug — see inline comment — that silently zeroed both token counts and skipped billing entirely).
- **Billing fallback:** if `outputTokens` comes back `0` but content was streamed, tokens are estimated from the streamed text (`estimateTokenCount`) rather than billing `$0`. Same fallback applies to `inputTokens`.
- **Idempotency (F4):** fixed in B1. The `(conversationId, clientMessageId)` pair is claimed once via Redis `SET NX`, so a retried request with the same pair does not insert a second user row. `regenerate: true` skips the user-row insert unconditionally, independent of the claim. Both are optional; omitting them keeps the legacy insert-every-time behavior.
- **Client abort (F5):** fixed in B1. The client-disconnect signal (bound to `reply.raw`'s `close` event) is combined with the 120 s safety timeout via `combineAbortSignals`, so aborting the browser fetch now cancels the upstream provider call. A disconnect is distinguished from a timeout by the abort `reason`. Billing for an aborted stream still goes through the `isPartial` path, i.e. what was received before the abort.
- **One billed request in flight per user (P1.2, new):** a second `/chat` from the same user while the first is still streaming *or still being billed* is rejected **before any provider call** with `409 { error: "REQUEST_IN_PROGRESS", message (Arabic), retryable: true, retryAfterSeconds: 2 }` and a `Retry-After: 2` header. **The client must treat this as retryable**: wait ~2 s and resend the same body (same `clientMessageId`; the 409 never consumes the idempotency claim, so the retry inserts the user row exactly once). Also possible in the few ms between a stream ending and its deduction committing, e.g. a fast follow-up message. If the lock store (Redis) is unreachable the paid path fails closed: `503 { error: "SERVICE_TEMPORARILY_UNAVAILABLE", retryable: true, retryAfterSeconds: 5 }` + `Retry-After: 5`. **Frontend (Session 11):** `stream-reader.ts` auto-retries 409 up to 3 times and 503 once, waiting `retryAfterSeconds` from the body (clamped 1-10 s) and resending the identical body; the web client does not send `clientMessageId` today. Lock TTL is 30 s, refreshed every 10 s while streaming.
- **Client IP (P1.3, new):** the web proxy sends `X-Client-IP` (taken from Vercel's trusted headers) with the internal token. The api believes `X-Client-IP` **only** on internal-token requests; direct callers cannot set their identity by header (`x-forwarded-for` is never read; `cf-connecting-ip` only via the `TRUST_CF_CONNECTING_IP` switch). No change to request or response bodies.
- **System prompt persistence (4c-relevant):** `systemPrompt` is written to the conversation row **only on the initial insert**, which uses `onConflictDoNothing()` — "first write wins". It is never overwritten by a later `/chat` call. To change it on an existing conversation, use `PATCH /api/conversations/[id]` `{ systemPrompt }` (`""` clears; omitting the key leaves it alone). A brand-new conversation has **no row until its first `/chat` call**, so there is nothing to PATCH before then — the prompt rides on the first send body.
- **`temperature` / `top_p` / `max_tokens` are per-request only.** `conversations` has no columns for them and PATCH does not accept them. The frontend therefore persists them client-side (localStorage, per conversation id, per browser) and re-sends on every message. Cross-device persistence is a future backend change: three nullable columns + PATCH body (packages/db and `app/api/**` are frozen for frontend sessions).
- **Known content-safety note:** the client renders whatever text arrives verbatim (per Rule 7 of the plan) — the stream contract itself does no sanitization; that's a rendering-layer concern, not a contract concern, but worth remembering when 4a builds the renderer.

---

## 4. Better Auth client (`apps/web/lib/auth-client.ts`)

Exported from `createAuthClient` + `twoFactorClient()` plugin:

```
signIn, signUp, signOut, useSession,
requestPasswordReset, resetPassword, verifyEmail, sendVerificationEmail,
changePassword, listSessions, revokeSession, revokeOtherSessions, revokeSessions,
twoFactor
```

`revokeSessions` (plural) is exported but was missing from the plan's
Appendix C list — added here. Note the split responsibility: `listSessions`
/ `revokeSession` / `revokeOtherSessions` / `revokeSessions` all exist on
the client, but the actual Settings UI does **not** use them for the
active-sessions feature — it uses the custom `/api/user/sessions*` REST
routes instead, specifically because Better Auth's own `listSessions()`
blanks every session's `token` except the current one (see §2). Only one
in-repo call site for `authClient.listSessions` was found; treat the
Better-Auth-native session methods as present-but-not-the-primary-path for
that feature when building 7.1.

Server side (`apps/web/lib/auth.ts`, frozen, not reproduced here): sign-up
requires header `x-turnstile-token`; referral capture rides on header
`x-referral-code`; password policy is min 8 chars + 1 uppercase + 1 digit,
surfaced as error code `WEAK_PASSWORD`; captcha failure surfaces as
`CAPTCHA_FAILED`.

---

## 5. Known quirks (read before building on top of any of these)

1. **In-memory rate limiting, not Redis.** `utils/rate-limiter.ts`'s `checkLimit` is a plain in-process `Map`. It resets on redeploy and does **not** coordinate across multiple container replicas or between the Fastify (`apps/api`) and Next.js (`apps/web`) processes — each has its own counter state. Only `FraudService.checkRedeemAttempt` (used inside `redeemCode()`) is actually Redis-backed and coordinates across instances; everything else using `checkLimit` (`submitManualPayment`, `generateApiKey`, `/api/redeem`'s pre-check, export-data, delete-account) is best-effort per-instance only.
2. **`/api/redeem`'s rate-limit responses are `200 OK` with `success:false`**, not `429` — a client that only checks HTTP status for throttling will miss this.
3. **`/api/transactions`'s `hasMore` can be wrong for `limit > 100`** — it compares against the unclamped requested limit, not the actual (capped) query limit. `billing.getTransactions` (tRPC) does not have this bug — its Zod schema caps `limit` at the input-validation layer instead of after the fact.
4. ~~`/api/admin/users/[id]/credits` is not atomic~~ — route deleted in P3.5; `admin.adjustCredits` (tRPC) is the only path.
5. **Session lookup is by `token`, not `id`**, everywhere in the tRPC context (`trpc.ts`). Any new code reading the `sessions` table must follow the same convention or auth will silently never match.
6. **API keys are SHA-256, not bcrypt** — by design, because lookup is by-value equality, not a compare. Do not "fix" this to bcrypt.
7. **Delete-account is anonymize-in-place, not a hard delete.** `balances`/`transactions`/`conversations` rows survive; only `users` PII, `accounts`, `twoFactor`, and `sessions` are removed/scrubbed.
8. **`/api/status` is a stub.** Any UI wired to it today is decorative (F11); real status data doesn't exist until backend track item B4.
9. **Chat stream is plain text, not JSON/SSE (v1, the default)** — do not build a JSON parser or an EventSource against `/api/chat`; treat the body as a raw text delta stream.
10. **`/chat`'s request body is validated (B1)** — but `null` for any optional field is rejected (see §3). Build request bodies by *omitting* unset keys, never by sending `null`. *(Previously: "zero runtime validation" — stale since B1.)*
11. **`models.list` prices are display credits per 1K tokens, not micro-credits.** Do not pass `creditsPerKInput/Output` through `formatCredits()` (it divides by 1,000,000). `avgResponseTimeMs` is `null` until the first gateway sync records a channel test — render an em dash.
12. **`GET /api/conversations` (list) omits `systemPrompt`.** It is only readable from `GET /api/conversations/[id]`.
13. **`PATCH /api/conversations/[id]` returns `{ success: true }` even when no row matched** `(id, userId)` — the UPDATE simply affects 0 rows. Treat success as "request accepted", not proof the row exists or is yours.
