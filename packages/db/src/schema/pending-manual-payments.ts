import {
  pgTable, uuid, varchar, text, timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { creditPackages } from "./credit-packages";
import { paymentMethods } from "./payment-methods";
import { transactions } from "./transactions";
import { manualPaymentStatusEnum } from "./enums";

/**
 * A buyer's claim that they sent a manual wallet/bank transfer, awaiting
 * admin verification (PAYMENT_METHODS_PLAN.md §7.10). This is a distinct
 * flow from redeem codes: there is no pre-issued code here — the row
 * itself is the record, and `balance.service.creditBalance()` is called
 * directly when an admin approves it (see admin.router.ts). This keeps
 * `redeemCode()`/`generateCode()` (ADR-004) completely untouched by the
 * manual-transfer path, and keeps the credit ledger's "every movement is
 * a transactions row" rule (Prompt.md rule 4) satisfied via `type: "payment"`
 * with `paymentId` set to this row's id — same mechanism the (disabled)
 * Moyasar webhook already used, just triggered by an admin click instead
 * of a provider webhook. See decisions.md ADR-008 for why this — not a
 * pre-generated code claim — is the manual-transfer mechanism.
 */
export const pendingManualPayments = pgTable("pending_manual_payments", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").references(() => users.id).notNull(),
  packageId:       uuid("package_id").references(() => creditPackages.id).notNull(),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id).notNull(),
  // Server-generated, shown to the buyer to write as the transfer
  // note/memo — lets an admin match an incoming wallet transfer to this
  // specific claim. Short and human-typeable, unlike a redeem code.
  referenceCode:   varchar("reference_code", { length: 24 }).unique().notNull(),
  // What the buyer says happened — never trusted on its own, only used to
  // help the admin locate the matching transfer before approving.
  submittedTxRef:  varchar("submitted_tx_ref", { length: 150 }),
  senderPhone:     varchar("sender_phone", { length: 30 }),
  senderName:      varchar("sender_name",  { length: 100 }),
  screenshotUrl:   text("screenshot_url"),
  notes:           text("notes"),
  status:          manualPaymentStatusEnum("status").default("pending").notNull(),
  reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => users.id),
  reviewedAt:      timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  // Set on approval — the transactions row that actually granted credits,
  // for a direct audit trail from claim → ledger entry.
  grantedTransactionId: uuid("granted_transaction_id").references(() => transactions.id),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

export type PendingManualPayment    = typeof pendingManualPayments.$inferSelect;
export type NewPendingManualPayment = typeof pendingManualPayments.$inferInsert;
