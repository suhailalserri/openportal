import {
  pgTable, uuid, varchar, text, integer, bigint, numeric, boolean, timestamp,
} from "drizzle-orm/pg-core";

/**
 * A purchasable credit bundle, priced in YER (PAYMENT_METHODS_PLAN.md §4).
 * SQL table name is "packages" per the plan, but exported here as
 * `creditPackages` to avoid confusion with the disabled, unrelated
 * `CREDIT_PACKAGES` static SAR config in @ai-platform/config — both can
 * legitimately appear in the same import statement in admin code.
 *
 * Moved out of static config (unlike the disabled SAR packages) so an
 * admin can create/edit/deactivate packages from the admin UI without a
 * deploy — see admin.router.ts's `packages.*` procedures.
 */
export const creditPackages = pgTable("packages", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  name:               varchar("name",    { length: 100 }).notNull(),
  nameAr:             varchar("name_ar", { length: 100 }).notNull(),
  // Buyer-facing price — the only price a Yemeni customer ever sees.
  priceYer:           integer("price_yer").notNull(),
  // Internal margin tracking only — never rendered to a buyer.
  priceUsdEquivalent: numeric("price_usd_equivalent", { precision: 10, scale: 2 }).notNull(),
  // Micro-credits granted on redemption/approval (1 credit = 1,000,000).
  credits:            bigint("credits", { mode: "number" }).notNull(),
  description:        text("description"),
  descriptionAr:      text("description_ar"),
  // false = hidden from the buyer-facing picker and the generate-codes
  // admin form, but codes/rows already issued against it keep working.
  isActive:           boolean("is_active").default(true).notNull(),
  sortOrder:          integer("sort_order").default(0).notNull(),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
  updatedAt:          timestamp("updated_at").defaultNow().notNull(),
});

export type CreditPackage    = typeof creditPackages.$inferSelect;
export type NewCreditPackage = typeof creditPackages.$inferInsert;
