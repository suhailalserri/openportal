import { pgTable, uuid, varchar, text, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";

// P5.1: one row per object in a private Supabase Storage bucket ("attachments", "audio").
// Purpose: quotas (bytes + uploads/day), orphan cleanup, and the deletion cascade.
// Lifecycle: pending (signed upload URL issued) -> confirmed (object exists, size recorded)
//            -> deleting (claimed by the sweep) -> deleted (removed from storage; the row is
//            kept ~2 days so the per-day upload count cannot be reset by deleting objects).
// `id` is the last segment of `objectKey` = `{userId}/{conversationId}/{id}`.
// `conversationId` is SET NULL if a conversation row is ever hard-deleted; the sweep
// treats NULL as "conversation gone" and removes the object.
// Migration: 0021_storage_objects.sql (adds a CHECK on `status` that push does not create).
export const storageObjects = pgTable("storage_objects", {
  id:                uuid("id").primaryKey().defaultRandom(),
  userId:            uuid("user_id").references(() => users.id).notNull(),
  conversationId:    uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  bucket:            varchar("bucket", { length: 32 }).notNull(),
  objectKey:         text("object_key").notNull().unique(),
  mimeType:          varchar("mime_type", { length: 100 }).notNull(),
  declaredSizeBytes: bigint("declared_size_bytes", { mode: "number" }).notNull(),
  sizeBytes:         bigint("size_bytes", { mode: "number" }),
  status:            varchar("status", { length: 16 }).default("pending").notNull(),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
  confirmedAt:       timestamp("confirmed_at"),
  deletedAt:         timestamp("deleted_at"),
}, (t) => ({
  userStatusIdx:  index("idx_storage_objects_user_status").on(t.userId, t.status),
  userCreatedIdx: index("idx_storage_objects_user_created").on(t.userId, t.createdAt),
  statusIdx:      index("idx_storage_objects_status_created").on(t.status, t.createdAt),
  conversationIdx: index("idx_storage_objects_conversation").on(t.conversationId),
}));

export type StorageObject    = typeof storageObjects.$inferSelect;
export type NewStorageObject = typeof storageObjects.$inferInsert;
