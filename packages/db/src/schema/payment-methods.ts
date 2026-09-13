import {
  pgTable, uuid, varchar, text, boolean, integer, timestamp,
} from "drizzle-orm/pg-core";
import { paymentMethodTypeEnum } from "./enums";

/**
 * A channel a buyer can use to pay (PAYMENT_METHODS_PLAN.md §4).
 * DB-backed (not static config) so an admin can add/edit/deactivate a
 * method — and its instructional copy — without a deploy. `accountCode`
 * is informational only (shown to the buyer, e.g. the tabweeb network
 * code or a wallet number) — nothing in the codebase calls out to it.
 */
export const paymentMethods = pgTable("payment_methods", {
  id:             uuid("id").primaryKey().defaultRandom(),
  name:           varchar("name",   { length: 100 }).notNull(),
  nameAr:         varchar("name_ar",{ length: 100 }).notNull(),
  type:           paymentMethodTypeEnum("type").notNull(),
  logoUrl:        text("logo_url"),
  // Wallet/network code shown to the buyer (tabweeb network code, wallet
  // phone number, bank IBAN, etc.) — free text since the format differs
  // per method/provider.
  accountCode:    varchar("account_code", { length: 100 }),
  // Numbered steps shown on the billing page for this method
  // ("١. افتح تطبيق جيب  ٢. اختر تحويل  ...").
  instructions:   text("instructions"),
  instructionsAr: text("instructions_ar"),
  isActive:       boolean("is_active").default(true).notNull(),
  sortOrder:      integer("sort_order").default(0).notNull(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});

export type PaymentMethod    = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
