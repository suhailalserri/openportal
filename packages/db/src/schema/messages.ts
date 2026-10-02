import {
  pgTable, uuid, varchar, text, bigint,
  integer, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { messageRoleEnum, feedbackEnum } from "./enums";

export const messages = pgTable("messages", {
  id:               uuid("id").primaryKey().defaultRandom(),
  conversationId:   uuid("conversation_id")
                      .references(() => conversations.id, { onDelete: "cascade" })
                      .notNull(),
  role:             messageRoleEnum("role").notNull(),
  // Flat text projection (search, export, history sent back to the model). Equals the concatenation
  // of the `text` blocks in `contentBlocks` whenever that column is set.
  content:          text("content").notNull(),
  // P6.4: the structured reply (thinking / text / tool_use blocks, in order). NULL = no structure
  // recorded (rows from before P6.4 and v1 replies): read it as one text block made of `content`.
  // Shape: packages/types/src/message-blocks.ts (typed `unknown[]` here because this package does
  // not depend on @ai-platform/types; the api validates on write by construction, readers must
  // ignore unknown blocks). Migration: 0024_message_content_blocks.sql (adds a CHECK push does not create).
  contentBlocks:    jsonb("content_blocks").$type<unknown[]>(),
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
