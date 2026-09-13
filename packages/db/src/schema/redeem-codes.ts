import {
  pgTable, uuid, varchar, bigint, timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { codeStatusEnum } from "./enums";
import { creditPackages } from "./credit-packages";
import { paymentMethods } from "./payment-methods";

export const redeemCodes = pgTable("redeem_codes", {
  id:               uuid("id").primaryKey().defaultRandom(),
  // Format: XXXX-XXXX-XXXX-CHCK (checksum in last segment)
  code:             varchar("code", { length: 32 }).unique().notNull(),
  // Value in micro-credits
  creditAmount:     bigint("credit_amount", { mode: "number" }).notNull(),
  // Human-readable label: "50 SAR", "10 USD"
  faceValue:        varchar("face_value", { length: 30 }),
  status:           codeStatusEnum("status").default("unused").notNull(),
  usedByUserId:     uuid("used_by_user_id").references(() => users.id),
  usedAt:           timestamp("used_at"),
  expiresAt:        timestamp("expires_at"),
  // Batch management
  batchId:          uuid("batch_id").notNull(),
  batchLabel:       varchar("batch_label", { length: 100 }),
  createdByAdminId: uuid("created_by_admin_id"),
  // Tagging only (PAYMENT_METHODS_PLAN.md §4) — nullable so pre-existing
  // codes and ad-hoc admin batches (no package picked) keep working.
  // redeemCode()/generateCode() behavior is completely unchanged by these:
  // a code is a code regardless of how it's tagged.
  packageId:        uuid("package_id").references(() => creditPackages.id),
  paymentMethodId:  uuid("payment_method_id").references(() => paymentMethods.id),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

export type RedeemCode    = typeof redeemCodes.$inferSelect;
export type NewRedeemCode = typeof redeemCodes.$inferInsert;
