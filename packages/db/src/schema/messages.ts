import {
  pgTable, uuid, varchar, text, bigint,
  integer, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { messageRoleEnum, feedbackEnum } from "./enums";

export const messages = pgTable("messages", {
  id:               uuid("id").primaryKey().defaultRandom(),
  conversationId:   uuid("conversation_id")
                      .references(() => conversations.id, { onDelete: "cascade" })
                      .notNull(),
  role:             messageRoleEnum("role").notNull(),
  content:          text("content").notNull(),
  inputTokens:      integer("input_tokens"),
  outputTokens:     integer("output_tokens"),
  creditCost:       bigint("credit_cost", { mode: "number" }),
  modelId:          varchar("model_id", { length: 100 }),
  gatewayRequestId: varchar("gateway_request_id", { length: 64 }),
  // Was this message truncated due to stream interruption?
  isPartial:        boolean("is_partial").default(false).notNull(),
  feedback:         feedbackEnum("feedback"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

export type Message    = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
