import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// Required by better-auth's passkey plugin (`@better-auth/passkey`, wired in
// apps/web/lib/auth.ts). The plugin owns this table: it stores one row per
// registered WebAuthn credential (the PUBLIC key only — the private key never
// leaves the user's device).
//
// The TypeScript property names below (credentialID, publicKey, deviceType,
// backedUp, aaguid …) must match better-auth's own field names exactly — the
// Drizzle adapter maps by property name, not by column name — which is why
// `credentialID` keeps its capital "ID". Column names stay snake_case like
// the rest of this schema. Migration: 0011_passkey.sql.
export const passkeys = pgTable("passkey", {
  id:           text("id").primaryKey(),
  name:         text("name"),
  publicKey:    text("public_key").notNull(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  credentialID: text("credential_id").notNull(),
  counter:      integer("counter").notNull(),
  deviceType:   text("device_type").notNull(),
  backedUp:     boolean("backed_up").notNull(),
  transports:   text("transports"),
  createdAt:    timestamp("created_at").defaultNow(),
  aaguid:       text("aaguid"),
});

export type Passkey    = typeof passkeys.$inferSelect;
export type NewPasskey = typeof passkeys.$inferInsert;
