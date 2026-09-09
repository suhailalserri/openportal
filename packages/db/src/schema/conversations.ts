import {
  pgTable, uuid, varchar, text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const conversations = pgTable("conversations", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id).notNull(),
  title:        text("title"),
  modelId:      varchar("model_id", { length: 100 }),
  systemPrompt: text("system_prompt"),
  isPinned:     boolean("is_pinned").default(false).notNull(),
  // Soft delete: hidden from user but kept for billing records
  deletedAt:    timestamp("deleted_at"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export type Conversation    = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
