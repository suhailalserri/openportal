import { db, transactions, auditLogs } from "@ai-platform/db";
import { and, eq, gte, lte, desc, sql, type SQL } from "drizzle-orm";

/**
 * Backend B3 (docs/FRONTEND_REBUILD_PLAN.md §7, "Admin logs + audit").
 * Replaces `apps/web/app/api/admin/logs/route.ts`, which returns the
 * latest 200 `usage_debit` transactions with no filters — 8c switches
 * the admin logs page over to `admin.listUsageLogs` (that REST route is
 * left in place here; removing it is a 9.3 cleanup item, not this one).
 *
 * These two functions are intentionally admin-wide: unlike
 * usage.service.ts (which always filters to `ctx.user.id` and is the
 * subject of an IDOR test proving it never leaks another user's rows),
 * `listUsageLogs` here has NO implicit user filter — an admin can see
 * every user's usage, and `userId` is an optional narrowing filter, not
 * a required scope. That's the entire point of the admin log view, so
 * admin-logs.service.test.ts asserts the opposite property from B2's
 * test: one admin call surfaces rows belonging to two different users.
 * Both procedures calling into this file are `adminProcedure` (role
 * checked in trpc.ts), so the authorization boundary is "is this caller
 * an admin", not "which rows belong to this caller".
 */

const MAX_RANGE_DAYS = 90;

export interface LogRange {
  from?: Date | undefined;
  to?:   Date | undefined;
}

/** Same clamp as usage.service.ts's clampRange — kept as a local copy rather
 * than importing across files for a two-line helper with a different
 * caller (admin, not a fixed user), so this file has no dependency on
 * usage.service.ts's user-scoping assumptions. */
function clampRange({ from, to }: LogRange): { from: Date; to: Date } {
  const clampedTo = to ?? new Date();
  const earliestAllowed = new Date(clampedTo.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const clampedFrom = from && from > earliestAllowed ? from : earliestAllowed;
  return { from: clampedFrom, to: clampedTo };
}

// ── Usage logs (admin-wide) ────────────────────────────────────────────

export interface UsageLogItem {
  id:           string;
  createdAt:    Date;
  userId:       string;
  modelId:      string | null;
  inputTokens:  number | null;
  outputTokens: number | null;
  amount:       number;
  requestId:    string | null;
}

export interface ListUsageLogsResult {
  items:      UsageLogItem[];
  nextCursor: string | null;
}

export interface ListUsageLogsOpts extends LogRange {
  limit:    number;
  cursor?:  string | undefined;
  userId?:  string | undefined;
  modelId?: string | undefined;
}

/**
 * Keyset pagination on (created_at, id), same tiebreak pattern as
 * usage.service.listUsage — safe under concurrent inserts, unlike
 * offset pagination, and supported by idx_transactions_type_date
 * (0009_usage_index.sql) since every query here filters
 * type = 'usage_debit' first.
 */
export async function listUsageLogs(opts: ListUsageLogsOpts): Promise<ListUsageLogsResult> {
  const { from, to } = clampRange(opts);
  const where = and(
    eq(transactions.type, "usage_debit"),
    gte(transactions.createdAt, from),
    lte(transactions.createdAt, to),
    opts.userId  ? eq(transactions.userId,  opts.userId)  : undefined,
    opts.modelId ? eq(transactions.modelId, opts.modelId) : undefined
  );

  let cursorClause: SQL | undefined;
  if (opts.cursor) {
    const cursorRow = await db.query.transactions.findFirst({
      where:   eq(transactions.id, opts.cursor),
      columns: { id: true, createdAt: true },
    });
    // An unknown/deleted cursor id is ignored rather than erroring, same
    // as usage.service.listUsage — starts the page over from the top
    // instead of 500ing on a stale link.
    if (cursorRow) {
      cursorClause = sql`(${transactions.createdAt}, ${transactions.id}) < (${cursorRow.createdAt.toISOString()}::timestamptz, ${cursorRow.id})`;
    }
  }

  const items = await db
    .select({
      id:           transactions.id,
      createdAt:    transactions.createdAt,
      userId:       transactions.userId,
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

// ── Audit logs ──────────────────────────────────────────────────────────

export interface AuditLogItem {
  id:         string;
  createdAt:  Date;
  adminId:    string;
  action:     string;
  targetType: string | null;
  targetId:   string | null;
  before:     unknown;
  after:      unknown;
  ip:         string | null;
}

export interface ListAuditLogsResult {
  items:      AuditLogItem[];
  nextCursor: string | null;
}

export interface ListAuditLogsOpts extends LogRange {
  limit:       number;
  cursor?:     string | undefined;
  adminId?:    string | undefined;
  action?:     string | undefined;
  targetType?: string | undefined;
  targetId?:   string | undefined;
}

export async function listAuditLogs(opts: ListAuditLogsOpts): Promise<ListAuditLogsResult> {
  const { from, to } = clampRange(opts);
  const where = and(
    gte(auditLogs.createdAt, from),
    lte(auditLogs.createdAt, to),
    opts.adminId    ? eq(auditLogs.adminId,    opts.adminId)    : undefined,
    opts.action     ? eq(auditLogs.action,     opts.action)     : undefined,
    opts.targetType ? eq(auditLogs.targetType, opts.targetType) : undefined,
    opts.targetId   ? eq(auditLogs.targetId,   opts.targetId)   : undefined
  );

  let cursorClause: SQL | undefined;
  if (opts.cursor) {
    const cursorRow = await db.query.auditLogs.findFirst({
      where:   eq(auditLogs.id, opts.cursor),
      columns: { id: true, createdAt: true },
    });
    if (cursorRow) {
      cursorClause = sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (${cursorRow.createdAt.toISOString()}::timestamptz, ${cursorRow.id})`;
    }
  }

  const items = await db
    .select({
      id:         auditLogs.id,
      createdAt:  auditLogs.createdAt,
      adminId:    auditLogs.adminId,
      action:     auditLogs.action,
      targetType: auditLogs.targetType,
      targetId:   auditLogs.targetId,
      before:     auditLogs.before,
      after:      auditLogs.after,
      ip:         auditLogs.ip,
    })
    .from(auditLogs)
    .where(cursorClause ? and(where, cursorClause) : where)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(opts.limit);

  return {
    items,
    nextCursor: items.length === opts.limit ? items[items.length - 1]!.id : null,
  };
}
