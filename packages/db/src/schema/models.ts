import { sql } from "drizzle-orm";
import {
  pgTable, varchar, boolean, integer,
  bigint, timestamp, uuid, numeric, text,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { modelStatusEnum } from "./enums";
import { jsonbValue } from "./jsonb-value";

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
  // A curated preset key (see MODEL_BADGE_KEYS in
  // @ai-platform/config/model-metadata.config), e.g. "new" | "flagship" |
  // "deprecated" — NOT freeform text or an emoji. "" means no badge.
  // Rendered as an icon+color chip (apps/web/components/icons/model-badge.tsx);
  // widened from the old 10-char emoji-sized column to fit the longest
  // preset key ("recommended", "deprecated").
  badge:            varchar("badge",    { length: 20  }).default("").notNull(),
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
  // Admin-toggled feature flags — what the model can actually do, beyond
  // the single `supportsVision` boolean this predates (kept as-is for
  // backward compat; "vision" may also appear here for filtering/display
  // alongside the other capabilities). A text[] rather than one boolean
  // column per feature (see MODEL_CATEGORY_KEYS in
  // @ai-platform/config/model-metadata.config) on purpose: new provider
  // capabilities (audio, video, ...) are common enough that a fixed-column
  // design would mean a migration every time one ships. Values are keys
  // from that shared list; unrecognized values are simply ignored at
  // render time rather than rejected, so this column is forward-compatible
  // with categories added after a given deploy.
  categories:       text("categories").array().default(sql`ARRAY[]::text[]`).notNull(),
  // Admin-entered benchmark scores (0-100), one per key in
  // LEADERBOARD_CATEGORY_KEYS (@ai-platform/config/model-metadata.config)
  // — e.g. { "reasoning": 91.7, "coding": 86.4, "overall": 83.4 }, meant
  // to be copied in from a public benchmark like livebench.ai. Distinct
  // from `categories` above (boolean "can it do this" flags): this is
  // "how good is it", used purely to rank/sort models within each tab of
  // the chat composer's model picker. jsonb rather than one numeric
  // column per category for the same forward-compatibility reason
  // `categories` is a text[] — a new leaderboard category is a config
  // change, not a migration. Missing keys mean "no score entered yet";
  // the picker's ranking falls back to the mean of whatever scores ARE
  // set rather than treating a missing score as 0 (see
  // resolveCategoryScore in apps/web/features/chat/lib/model-ranking.ts).
  // `jsonbValue`, not `jsonb()`: see jsonb-value.ts. The SQL default is the same one the database
  // already has, so push/generate see no change and an omitted value stores a real object.
  categoryScores:   jsonbValue<Record<string, number>>("category_scores").default(sql`'{}'::jsonb`).notNull(),
  // Admin-authored behavior rules for this specific model — appended after
  // the platform-wide base prompt (see platform_config table) when a chat
  // request is assembled server-side in gateway.service.ts. Never sent by
  // or exposed to the client as an editable field; not the same thing as
  // the old per-conversation systemPrompt (removed — see 0014 migration),
  // which was fully user-controlled and is gone entirely now.
  systemPrompt:     text("system_prompt"),
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
