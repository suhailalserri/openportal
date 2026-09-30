import { pgTable, text, integer, bigint, index } from "drizzle-orm/pg-core";

// Required by better-auth's `rateLimit.storage: "database"` (wired in
// apps/web/lib/auth.ts, P3.5). Without it every serverless instance keeps its
// own in-memory counter and a login limit of "5 per minute" is really "5 per
// minute per instance".
//
// better-auth owns this table: one row per (client IP + auth path) key. The
// TypeScript property names (`key`, `count`, `lastRequest`) must match its
// field names exactly (the Drizzle adapter maps by property name); the
// adapter registers it under the model name `rateLimit`. `lastRequest` is a
// Unix time in milliseconds. Rows are pruned daily by the api's
// `pruneAuthRateLimit` job. Migration: 0019_auth_rate_limit.sql.
//
// `key` is indexed but deliberately NOT unique: two simultaneous first
// requests from one client would otherwise hit a unique violation and turn an
// ordinary auth call (e.g. a session check) into a 500. A rare duplicate row
// only splits a counter slightly; the daily prune removes it.
export const rateLimits = pgTable("rate_limit", {
  id:          text("id").primaryKey(),
  key:         text("key").notNull(),
  count:       integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
}, (t) => ({
  keyIdx:         index("idx_rate_limit_key").on(t.key),
  lastRequestIdx: index("idx_rate_limit_last_request").on(t.lastRequest),
}));

export type RateLimitRow = typeof rateLimits.$inferSelect;
