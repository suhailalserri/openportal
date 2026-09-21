
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

### Not done this round
4c (input/models/parameters, needs B1 — done, not yet built) and 4d
(conversations + cache) are still open, per the plan's own phase list.
