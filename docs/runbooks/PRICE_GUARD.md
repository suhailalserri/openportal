# Provider-cost guard runbook (P3.6, closes N7)

**What it protects against:** selling credits for less than the provider charges, because a markup was typed wrong, a wholesale cost was left at 0, or the provider raised its price and nobody noticed.

## What runs

| Check | When | Alert |
|---|---|---|
| Unsafe price saved in the admin (`models.publish`): below cost, margin under 40%, or unpriced | Immediately on save | Telegram, CRITICAL if below cost, else WARNING. Local numbers only (no network). |
| Daily digest over every **published and available** model | 04:00 UTC, job `priceGuard` (reports queue) | ONE Telegram message, only if something is wrong. Silent when clean. |
| Same checks, printed as a table | On demand | `pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/price-audit.ts` (needs `DATABASE_URL`; `--offline` skips the OpenRouter feed) |

Findings:
- `below_cost` (CRITICAL): sell price per 1M tokens (`wholesale x markup`) is under the real cost on the input or output side. Real cost = the OpenRouter price when the model id matches, else our own wholesale.
- `low_margin`: gross margin under 40% (`MIN_GROSS_MARGIN` in `apps/api/src/services/price-guard.ts`).
- `zero_wholesale`: wholesale is 0 on both sides, the id does not end in `:free`, and no upstream price was found. The model is being billed at 0.
- `upstream_drift`: our wholesale differs from the OpenRouter price by more than 5%.
- "Upstream price feed unavailable": the OpenRouter list could not be read; drift was not checked. If it repeats for days, the check is blind: look at `https://openrouter.ai/api/v1/models`.
- "no upstream match N" in the header: those models could not be matched to an OpenRouter id (for example a model served through another channel). They still get the margin checks against our own wholesale, but not the drift check. Confirm their wholesale by hand.

## When an alert arrives
1. Open Admin > Models, find the model. Compare wholesale to the provider's price page.
2. Fix wholesale and/or markup and save. The save writes a new `provider_prices` row, so the dashboard cost stays right.
3. If the price was wrong for a while, users were undercharged. Quantify with the dashboard's cost vs revenue for those days; decide whether to do anything (usually nothing).
4. To stop the loss immediately without fixing the price: toggle the model unavailable.

## Owner steps (not code)
1. **Apply migration `0020_provider_prices_backfill.sql`** to production (DB Operations workflow, or paste into the Supabase SQL editor). Safe before or after the deploy; idempotent. Until it runs, the dashboard's cost is $0 for models nobody re-saves.
2. Run `price-audit` once (command above) and fix what it lists before launch.
3. Drill (once, then tick LAUNCH_CHECKLIST "Provider-cost guard alerting"): in Admin > Models set a test model's markup to 0.5 and save. A CRITICAL Telegram message should arrive within seconds. Put the markup back.
   Digest drill: the job runs at 04:00 UTC; to force it, temporarily leave that model at markup 0.5 overnight or run `price-audit` (same logic, no Telegram).

## Known limits
- The dashboard cost for periods **before** migration 0020 is an estimate: past usage is valued at today's wholesale cost (true past prices are unknown). From the first price change made after deploy, history is exact.
- `provider_prices.model_id` is 100 characters; `models.id` allows 150. Longer ids get no price history (they are skipped, not failed).
- OpenRouter is the only upstream feed. If a model is served by another provider through the gateway, drift is not detected for it.
- One alert per day while a problem persists; there is no de-duplication across days by design (a loss you have not fixed should keep nagging).
