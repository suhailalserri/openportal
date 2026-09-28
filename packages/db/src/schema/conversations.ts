import {
  pgTable, uuid, varchar, text, boolean, timestamp, integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const conversations = pgTable("conversations", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id).notNull(),
  title:        text("title"),
  modelId:      varchar("model_id", { length: 100 }),
  isPinned:     boolean("is_pinned").default(false).notNull(),
  // Rolling-history compaction: `summary` is a model-generated compression
  // of the conversation's first `summarizedMessageCount` messages (in
  // chronological order — the same order the client sends `messages` in on
  // every /chat call). A count, not a message id, on purpose: the client
  // payload is a bare `{role, content}[]` with no ids attached, so a count
  // is what can actually be matched against it position-for-position (see
  // history-compaction.ts). Raw rows in `messages` are NEVER deleted or
  // affected by this — it only controls what gets resent to the provider,
  // never what's stored or shown in the UI. Both null/0 until the
  // conversation first crosses the summarization threshold.
  summary:                text("summary"),
  summarizedMessageCount: integer("summarized_message_count").default(0).notNull(),
  // Soft delete: hidden from user but kept for billing records
  deletedAt:    timestamp("deleted_at"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export type Conversation    = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
