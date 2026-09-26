import {
  pgTable, varchar, boolean, integer,
  bigint, timestamp, uuid, numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { modelStatusEnum } from "./enums";

/**
 * Runtime model configuration — stored in DB so admins can toggle
 * availability, adjust display names, and change markup without a redeploy.
 *
 * Source of truth split:
 *   - New API (the gateway) owns channels/provider keys/failover — it only
 *     knows "what model strings can I technically serve right now".
 *   - This table owns the business layer: display name, pricing, tier,
 *     rate limit, and whether a model is actually shown to users.
 * `status` and `isAvailable` are deliberately separate: `status` is the
 * admin's lifecycle decision (pending/published/disabled); `isAvailable` is
 * the fast "show it or not" gate that both the admin and the sync job can
 * flip (e.g. sync auto-hides a model whose channel disappeared without
 * changing its `status` back to pending).
 */
export const models = pgTable("models", {
  id:               varchar("id", { length: 150 }).primaryKey(),
  displayName:      varchar("display_name",    { length: 100 }).notNull(),
  displayNameAr:    varchar("display_name_ar", { length: 100 }).notNull(),
  badge:            varchar("badge",    { length: 10  }).default("").notNull(),
  provider:         varchar("provider", { length: 50  }).notNull(),
  // Which @lobehub/icons provider key to render for this row (e.g.
  // "openai", "anthropic", "google"). Deliberately separate from
  // `provider`: that column is system-managed and gets overwritten on
  // every gateway sync from the New API channel's `type` field (see
  // model-sync.service.ts), so it's not safe for an admin's manual icon
  // choice to live there — it would just get reverted on the next sync.
  // Null means "auto-detect from `provider`" (see lib/provider-icons.tsx
  // in apps/web); an admin only sets this explicitly when auto-detection
  // picks the wrong brand or the provider string doesn't match any
  // known key.
  providerIconKey:  varchar("provider_icon_key", { length: 50 }),
  tier:             varchar("tier",     { length: 20  }).default("standard").notNull(),
  status:           modelStatusEnum("status").default("published").notNull(),
  isAvailable:      boolean("is_available").default(true).notNull(),
  // Stored as string because numeric columns return strings from pg driver
  markupMultiplier: numeric("markup_multiplier", { precision: 4, scale: 2 }).default("2.0").notNull(),
  // Wholesale cost per 1M tokens (USD), as string for the same pg-driver reason.
  // Replaces the old static WHOLESALE_COSTS map — set by an admin on publish,
  // 0 until then so nothing gets billed for an unconfigured model.
  wholesaleCostInputPerM:  numeric("wholesale_cost_input_per_m",  { precision: 10, scale: 4 }).default("0").notNull(),
  wholesaleCostOutputPerM: numeric("wholesale_cost_output_per_m", { precision: 10, scale: 4 }).default("0").notNull(),
  contextWindow:    integer("context_window").notNull(),
  maxOutputTokens:  integer("max_output_tokens").notNull(),
  supportsVision:   boolean("supports_vision").default(false).notNull(),
  // App-layer usage cap, independent of New API's channel-level limits.
  rateLimitPerUserDaily: integer("rate_limit_per_user_daily"),
  // Average response time (ms) across the gateway channels currently
  // serving this model, per New API's own channel health check
  // (`response_time` / `test_time` on /api/channel). Refreshed by
  // syncModelsFromGateway (see model-sync.service.ts) — null until the
  // first sync runs, or if no enabled channel has a recorded test yet.
  // This is real, measured latency, not an estimate — the model picker
  // labels it "approximate" only because it's a point-in-time average,
  // not because the number itself is made up.
  avgResponseTimeMs: integer("avg_response_time_ms"),
  // Last time the gateway sync saw this model id on an active channel.
  lastSeenAt:       timestamp("last_seen_at"),
  // Aggregate usage stats (updated post-stream via background job)
  totalRequests:    bigint("total_requests",  { mode: "number" }).default(0).notNull(),
  totalTokensIn:    bigint("total_tokens_in", { mode: "number" }).default(0).notNull(),
  totalTokensOut:   bigint("total_tokens_out",{ mode: "number" }).default(0).notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  updatedByAdminId: uuid("updated_by_admin_id").references(() => users.id),
});

export type Model    = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
