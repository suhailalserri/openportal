import { db, transactions } from "@ai-platform/db";
import { and, eq, gte, lte, desc, sql, type SQL } from "drizzle-orm";

/**
 * Backend B2 (docs/FRONTEND_REBUILD_PLAN.md §7). "Usage" here means AI
 * chat spend specifically — `type = 'usage_debit'` rows, which are the
 * only transactions carrying modelId/inputTokens/outputTokens metadata
 * (see transactions.ts). Redeems, admin credits, refunds, payments and
 * referral bonuses are excluded on purpose: Phase 6's dashboard is about
 * "what did I spend AI usage on", not the full ledger (that's already
 * `billing.getTransactions` / the History tab from 5.2).
 *
 * Every function here takes `userId` as an explicit, required first
 * argument and every query below filters on it — there is no code path
 * in this file that can return another user's rows. That's the property
 * the IDOR test in usage.service.test.ts asserts directly, and why the
 * router (billing.router.ts) always passes `ctx.user.id`, never a
 * client-supplied id.
 */

const MAX_RANGE_DAYS = 90;

export interface UsageRange {
  from?: Date | undefined;
  to?:   Date | undefined;
}

/**
 * Clamps an optional [from, to] window to the last MAX_RANGE_DAYS days
 * (plan: "range ≤ 90 days"). `to` defaults to now; `from` defaults to
 * (and is never allowed to precede) `to - 90d`. Both bounds are on
 * `created_at`, matching the timestamp every other billing query uses.
 */
function clampRange({ from, to }: UsageRange): { from: Date; to: Date } {
  const clampedTo = to ?? new Date();
  const earliestAllowed = new Date(clampedTo.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const clampedFrom = from && from > earliestAllowed ? from : earliestAllowed;
  return { from: clampedFrom, to: clampedTo };
}

/** Shared WHERE base for every query in this file: this user, usage_debit, in-range. */
function usageWhere(userId: string, range: UsageRange, modelId?: string) {
  const { from, to } = clampRange(range);
  return and(
    eq(transactions.userId, userId),
    eq(transactions.type, "usage_debit"),
    gte(transactions.createdAt, from),
    lte(transactions.createdAt, to),
    modelId ? eq(transactions.modelId, modelId) : undefined
  );
}

export interface UsageSummary {
  totalSpentMicroCredits: number;
  requestCount:           number;
  inputTokens:            number;
  outputTokens:           number;
  avgCostMicroCredits:    number;
  topModelId:             string | null;
}

export async function getUsageSummary(userId: string, range: UsageRange = {}): Promise<UsageSummary> {
  const where = usageWhere(userId, range);

  const [totals] = await db
    .select({
      // amount is negative for debits (see transactions.ts) — flip sign so
      // callers get a positive "spent" figure, same convention getBalance()
      // already uses for totalSpent.
      totalSpent:   sql<number>`coalesce(sum(-${transactions.amount}), 0)`.mapWith(Number),
      requestCount: sql<number>`count(*)`.mapWith(Number),
      inputTokens:  sql<number>`coalesce(sum(${transactions.inputTokens}), 0)`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${transactions.outputTokens}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(where);

  const [top] = await db
    .select({
      modelId: transactions.modelId,
      count:   sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .where(where)
    .groupBy(transactions.modelId)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const requestCount = totals?.requestCount ?? 0;
  const totalSpent   = totals?.totalSpent ?? 0;

  return {
    totalSpentMicroCredits: totalSpent,
    requestCount,
    inputTokens:            totals?.inputTokens ?? 0,
    outputTokens:           totals?.outputTokens ?? 0,
    avgCostMicroCredits:    requestCount > 0 ? Math.round(totalSpent / requestCount) : 0,
    topModelId:             top?.modelId ?? null,
  };
}

export interface UsageTimeseriesPoint {
  date:                   string; // YYYY-MM-DD, UTC day bucket
  spentMicroCredits:      number;
  requestCount:           number;
}

export async function getUsageTimeseries(userId: string, range: UsageRange = {}): Promise<UsageTimeseriesPoint[]> {
  const where = usageWhere(userId, range);

  const rows = await db
    .select({
      day:     sql<string>`to_char(date_trunc('day', ${transactions.createdAt}), 'YYYY-MM-DD')`,
      spent:   sql<number>`coalesce(sum(-${transactions.amount}), 0)`.mapWith(Number),
      count:   sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .where(where)
    .groupBy(sql`date_trunc('day', ${transactions.createdAt})`)
    .orderBy(sql`date_trunc('day', ${transactions.createdAt}) asc`);

  return rows.map((r) => ({
    date:              r.day,
    spentMicroCredits: r.spent,
    requestCount:      r.count,
  }));
}

export interface UsageByModelRow {
  modelId:           string | null;
  spentMicroCredits: number;
  requestCount:      number;
  inputTokens:       number;
  outputTokens:      number;
}

export async function getUsageByModel(userId: string, range: UsageRange = {}): Promise<UsageByModelRow[]> {
  const where = usageWhere(userId, range);

  const rows = await db
    .select({
      modelId:      transactions.modelId,
      spent:        sql<number>`coalesce(sum(-${transactions.amount}), 0)`.mapWith(Number),
      count:        sql<number>`count(*)`.mapWith(Number),
      inputTokens:  sql<number>`coalesce(sum(${transactions.inputTokens}), 0)`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${transactions.outputTokens}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(where)
    .groupBy(transactions.modelId)
    .orderBy(desc(sql`sum(-${transactions.amount})`));

  return rows.map((r) => ({
    modelId:           r.modelId,
    spentMicroCredits: r.spent,
    requestCount:      r.count,
    inputTokens:       r.inputTokens,
    outputTokens:      r.outputTokens,
  }));
}

export interface UsageListItem {
  id:           string;
  createdAt:    Date;
  modelId:      string | null;
  inputTokens:  number | null;
  outputTokens: number | null;
  amount:       number;
  requestId:    string | null;
}

export interface ListUsageResult {
  items:      UsageListItem[];
  nextCursor: string | null;
}

/**
 * Keyset (not offset) pagination: `cursor` is the `id` of the last row
 * from the previous page. (created_at, id) is used as the tiebreak key
 * via a row-constructor comparison, which stays index-friendly and
 * correct even when multiple rows share a created_at timestamp — plain
 * offset pagination on a frequently-appended table like this one can
 * skip/duplicate rows under concurrent writes, which is exactly the bug
 * class keyset pagination avoids.
 */
export async function listUsage(
  userId: string,
  opts: { limit: number; cursor?: string | undefined; modelId?: string | undefined } & UsageRange
): Promise<ListUsageResult> {
  const where = usageWhere(userId, opts, opts.modelId);

  let cursorClause: SQL | undefined;
  if (opts.cursor) {
    const cursorRow = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, opts.cursor), eq(transactions.userId, userId)),
      columns: { id: true, createdAt: true },
    });
    // An invalid/foreign cursor (e.g. another user's transaction id) is
    // silently ignored rather than erroring — same IDOR guarantee as
    // every other query here: it can never be used to page into rows
    // outside `usageWhere`'s own userId filter.
    if (cursorRow) {
      cursorClause = sql`(${transactions.createdAt}, ${transactions.id}) < (${cursorRow.createdAt}, ${cursorRow.id})`;
    }
  }

  const items = await db
    .select({
      id:           transactions.id,
      createdAt:    transactions.createdAt,
      modelId:      transactions.modelId,
      inputTokens:  transactions.inputTokens,
      outputTokens: transactions.outputTokens,
      amount:       transactions.amount,
      requestId:    transactions.requestId,
    })
    .from(transactions)
    .where(cursorClause ? and(where, cursorClause) : where)
    .orderBy(desc(transactions.createdAt), desc(transactions.id))
    .limit(opts.limit);

  return {
    items,
    nextCursor: items.length === opts.limit ? items[items.length - 1]!.id : null,
  };
}

/**
 * Non-paginated variant for CSV export (apps/web/app/api/usage/export) —
 * same filters/scoping as listUsage, capped hard at 5,000 rows so a wide
 * date range can't build an unbounded string in memory. The UI's date
 * range picker is already capped at 90 days; 5,000 rows over 90 days is
 * ~56/day, generous for a single user's chat usage.
 */
export async function listUsageForExport(
  userId: string,
  opts: { modelId?: string | undefined } & UsageRange
): Promise<UsageListItem[]> {
  const where = usageWhere(userId, opts, opts.modelId);
  return db
    .select({
      id:           transactions.id,
      createdAt:    transactions.createdAt,
      modelId:      transactions.modelId,
      inputTokens:  transactions.inputTokens,
      outputTokens: transactions.outputTokens,
      amount:       transactions.amount,
      requestId:    transactions.requestId,
    })
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.createdAt))
    .limit(5000);
}
