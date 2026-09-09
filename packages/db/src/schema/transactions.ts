import {
  pgTable, uuid, bigint, text, varchar,
  timestamp, integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { txTypeEnum } from "./enums";

export const transactions = pgTable("transactions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id).notNull(),
  type:         txTypeEnum("type").notNull(),
  // Positive = credit added, Negative = credit deducted
  amount:       bigint("amount",        { mode: "number" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
  description:  text("description"),
  // Chat usage metadata
  requestId:    varchar("request_id",  { length: 64 }),
  modelId:      varchar("model_id",    { length: 100 }),
  inputTokens:  integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  // Redeem metadata
  redeemCodeId: uuid("redeem_code_id"),
  // Admin action metadata
  adminId:      uuid("admin_id"),
  adminNote:    text("admin_note"),
  // Payment metadata
  paymentId:    varchar("payment_id", { length: 100 }),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type Transaction    = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
