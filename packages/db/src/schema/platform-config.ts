import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, bigint } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Fixed id of the single row this table ever holds. */
export const PLATFORM_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Singleton table (exactly one row, id fixed below) holding the base
 * system-prompt rules applied to EVERY chat request across every model —
 * tone, safety boundaries, what not to reveal about routing/provider,
 * formatting defaults. Admin-editable only (admin.router.ts), never
 * accepted from the `/chat` request body. Layered under a model's own
 * `models.systemPrompt` in gateway.service.ts.
 *
 * A dedicated table (rather than a column bolted onto some other table)
 * because this is genuinely platform-scoped, not per-model or
 * per-conversation, and because it may grow more singleton settings later
 * without overloading an unrelated table.
 */
export const platformConfig = pgTable("platform_config", {
  id:               uuid("id").primaryKey().default(sql`'00000000-0000-0000-0000-000000000001'`),
  basePrompt:       text("base_prompt"),
  // Welcome bonus (ADR-010) — admin-controlled from /admin/welcome-bonus.
  // Amount is in micro-credits like every other money column.
  welcomeBonusEnabled:      boolean("welcome_bonus_enabled").default(false).notNull(),
  welcomeBonusMicroCredits: bigint("welcome_bonus_micro_credits", { mode: "number" }).default(0).notNull(),
  // Stamped ONCE, the first time an admin enables the bonus, and never
  // reset by later off/on toggles. Only accounts created at/after this
  // moment are "new users" for the bonus, so switching the feature on
  // never hands credit to the whole existing user base.
  welcomeBonusLaunchedAt:   timestamp("welcome_bonus_launched_at"),
  // P6.3d feature switches (admin-controlled from /admin/features). Each ships OFF; when an admin
  // turns one on it applies to EVERY user. Read by `user.features`, written by `platformConfig.updateFeatures`.
  featureAttachments:       boolean("feature_attachments").default(false).notNull(),
  featureVoice:             boolean("feature_voice").default(false).notNull(),
  featureThinking:          boolean("feature_thinking").default(false).notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  updatedByAdminId: uuid("updated_by_admin_id").references(() => users.id),
});

export type PlatformConfig    = typeof platformConfig.$inferSelect;
export type NewPlatformConfig = typeof platformConfig.$inferInsert;
