import { pgTable, uuid, varchar, text, bigint, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";
import { storageObjects } from "./storage-objects";

// P5.2a: one row per file the user attached to a conversation. The bytes live in the private
// `attachments` bucket; ownership, quotas and cleanup stay in `storage_objects` (P5.1).
// `id` IS the storage object's id (same uuid, last segment of its object key), so there is no
// second key column to drift out of sync.
// Lifecycle: uploading (signed URL issued) -> processing (confirmed, extraction queued)
//            -> ready | failed. A row whose object is later deleted (conversation/account
//            deleted, orphan, failed extraction) becomes `failed` / OBJECT_DELETED and its
//            `extractedText` is cleared in the same sweep. The row itself goes when the
//            storage_objects row is purged (ON DELETE CASCADE).
// `extractedText` is UNTRUSTED document content: only ever placed inside a delimited
// "untrusted document" block in a prompt (5.2b), never as system text.
// Migration: 0022_attachments.sql (adds CHECKs on `status` and `kind` that push does not create).
export const attachments = pgTable("attachments", {
  id:             uuid("id").primaryKey().references(() => storageObjects.id, { onDelete: "cascade" }),
  userId:         uuid("user_id").references(() => users.id).notNull(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  // Client-supplied, sanitized (see attachments.policy.ts). Display only; never used as a path.
  fileName:       varchar("file_name", { length: 255 }).notNull(),
  mimeType:       varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes:      bigint("size_bytes", { mode: "number" }).notNull(),
  kind:           varchar("kind", { length: 16 }).notNull(),                 // image | document | audio
  status:         varchar("status", { length: 16 }).default("uploading").notNull(),
  errorCode:      varchar("error_code", { length: 32 }),
  extractedText:  text("extracted_text"),
  extractedChars: integer("extracted_chars"),
  // true when extractedText was cut at the hard cap (5.2b cuts again to the model's context window).
  truncated:      boolean("truncated").default(false).notNull(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userStatusIdx:   index("idx_attachments_user_status").on(t.userId, t.status),
  statusUpdatedIdx: index("idx_attachments_status_updated").on(t.status, t.updatedAt),
  conversationIdx: index("idx_attachments_conversation").on(t.conversationId),
}));

export type Attachment    = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
