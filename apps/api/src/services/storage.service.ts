/**
 * P5.1: upload quotas, signed URLs, orphan cleanup and the deletion cascade for the private
 * `attachments` / `audio` buckets. The DB (`storage_objects`) is the source of truth for who
 * owns what; Supabase only ever holds the bytes. P5.2's tRPC procedures
 * (`attachments.createUploadUrl` / `confirm`) call this.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, conversations, storageObjects, attachments } from "@ai-platform/db";
import { getStorageClient, type StorageClient } from "./storage.client";
import {
  BUCKETS, STORAGE_LIMITS, StorageError, buildObjectKey, validateUpload,
  type BucketName, type StorageLimits,
} from "./storage.policy";

export interface RequestUploadInput {
  userId: string;
  conversationId: string;
  bucket: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadTicket {
  objectId: string;
  bucket: BucketName;
  objectKey: string;
  uploadUrl: string;
  mimeType: string;
  maxBytes: number;
}

export interface SweepResult { claimed: number; removed: number; failed: number; purged: number }

const ANONYMIZED_EMAIL_LIKE = "deleted-%@deleted.invalid"; // see apps/web/app/api/user/delete-account/route.ts
const REMOVE_BATCH = 100;

export function createStorageService(deps: {
  client: StorageClient;
  now?: () => Date;
  limits?: Partial<StorageLimits>;
}) {
  const { client } = deps;
  const now = deps.now ?? (() => new Date());
  const limits: StorageLimits = { ...STORAGE_LIMITS, ...deps.limits };

  /** Claim -> remove -> mark deleted. A failed remove leaves the row 'deleting' for the next sweep. */
  async function removeClaimed(): Promise<{ removed: number; failed: number }> {
    const rows = await db.select({ id: storageObjects.id, bucket: storageObjects.bucket, objectKey: storageObjects.objectKey })
      .from(storageObjects).where(eq(storageObjects.status, "deleting")).limit(500);
    let removed = 0, failed = 0;
    const byBucket = new Map<string, typeof rows>();
    for (const r of rows) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r]);
    for (const [bucket, list] of byBucket) {
      for (let i = 0; i < list.length; i += REMOVE_BATCH) {
        const chunk = list.slice(i, i + REMOVE_BATCH);
        try {
          await client.removeObjects(bucket as BucketName, chunk.map((r) => r.objectKey));
          // P5.2a: the extracted text is a copy of the file's content, so it goes with the object.
          // Done BEFORE marking the row deleted: if this fails the row stays 'deleting' and the
          // next sweep retries (removing a missing object is not an error).
          await db.update(attachments)
            .set({
              status: "failed",
              errorCode: sql`COALESCE(${attachments.errorCode}, 'OBJECT_DELETED')`,
              extractedText: null,
              updatedAt: now(),
            })
            .where(inArray(attachments.id, chunk.map((r) => r.id)));
          await db.update(storageObjects)
            .set({ status: "deleted", deletedAt: now() })
            .where(and(inArray(storageObjects.id, chunk.map((r) => r.id)), eq(storageObjects.status, "deleting")));
          removed += chunk.length;
        } catch {
          failed += chunk.length; // retried by the next sweep
        }
      }
    }
    return { removed, failed };
  }

  return {
    /** Validates, checks ownership + quotas, records a pending row, then signs. */
    async requestUpload(input: RequestUploadInput): Promise<UploadTicket> {
      const v = validateUpload({ bucket: input.bucket, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
      if (!v.ok) throw new StorageError(v.code);
      const bucket = input.bucket as BucketName;

      const [conv] = await db.select({ id: conversations.id }).from(conversations)
        .where(and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, input.userId),
          isNull(conversations.deletedAt),
        )).limit(1);
      if (!conv) throw new StorageError("CONVERSATION_NOT_FOUND");

      const objectId = randomUUID();
      const objectKey = buildObjectKey(input.userId, input.conversationId, objectId);
      const at = now();

      // Serialize per user so two concurrent requests cannot both pass the quota check.
      // A raw JS Date inside a `sql` template is not serialized by postgres-js (Drizzle only maps
      // Dates for typed columns), so pass an ISO string and cast it in SQL.
      const dayAgoIso = new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"storage:" + input.userId}::text))`);
        const [usage] = await tx.select({
          bytes: sql<string>`COALESCE(SUM(COALESCE(${storageObjects.sizeBytes}, ${storageObjects.declaredSizeBytes})) FILTER (WHERE ${storageObjects.status} IN ('pending','confirmed')), 0)`,
          today: sql<string>`COUNT(*) FILTER (WHERE ${storageObjects.createdAt} >= ${dayAgoIso}::timestamp)`,
        }).from(storageObjects).where(eq(storageObjects.userId, input.userId));
        if (Number(usage?.today ?? 0) >= limits.maxUploadsPerDay) throw new StorageError("QUOTA_DAILY");
        if (Number(usage?.bytes ?? 0) + input.sizeBytes > limits.maxTotalBytesPerUser) throw new StorageError("QUOTA_BYTES");
        await tx.insert(storageObjects).values({
          id: objectId, userId: input.userId, conversationId: input.conversationId,
          bucket, objectKey, mimeType: v.mime, declaredSizeBytes: input.sizeBytes,
          status: "pending", createdAt: at,
        });
      });

      let uploadUrl: string;
      try {
        uploadUrl = await client.createSignedUploadUrl(bucket, objectKey);
      } catch (err) {
        // Nothing was issued, so do not charge the user's quota for it.
        await db.delete(storageObjects).where(eq(storageObjects.id, objectId));
        throw err;
      }
      return { objectId, bucket, objectKey, uploadUrl, mimeType: v.mime, maxBytes: v.policy.maxBytes };
    },

    /** Called after the browser's PUT. Verifies the object exists and is no bigger than declared. */
    async confirmUpload(input: { userId: string; objectId: string }): Promise<{ objectId: string; sizeBytes: number }> {
      const [row] = await db.select().from(storageObjects)
        .where(and(eq(storageObjects.id, input.objectId), eq(storageObjects.userId, input.userId))).limit(1);
      if (!row || row.status === "deleting" || row.status === "deleted") throw new StorageError("OBJECT_NOT_FOUND");
      if (row.status === "confirmed") return { objectId: row.id, sizeBytes: row.sizeBytes ?? row.declaredSizeBytes };

      const info = await client.getObjectInfo(row.bucket as BucketName, row.objectKey);
      if (!info) throw new StorageError("OBJECT_NOT_FOUND");

      if (info.sizeBytes <= 0 || info.sizeBytes > row.declaredSizeBytes || info.sizeBytes > BUCKETS[row.bucket as BucketName].maxBytes) {
        const claimed = await db.update(storageObjects).set({ status: "deleting" })
          .where(and(eq(storageObjects.id, row.id), eq(storageObjects.status, "pending"))).returning({ id: storageObjects.id });
        if (claimed.length > 0) await removeClaimed().catch(() => {});
        throw new StorageError("FILE_TOO_LARGE");
      }

      const confirmed = await db.update(storageObjects)
        .set({ status: "confirmed", sizeBytes: info.sizeBytes, confirmedAt: now() })
        .where(and(eq(storageObjects.id, row.id), eq(storageObjects.status, "pending")))
        .returning({ id: storageObjects.id });
      if (confirmed.length === 0) throw new StorageError("OBJECT_NOT_FOUND"); // swept while we were checking
      return { objectId: row.id, sizeBytes: info.sizeBytes };
    },

    /**
     * P5.2a: delete a confirmed object right away (extraction failed: the file is unusable, so it
     * should not keep counting against the user's quota or sit in storage). Returns false when
     * the object is not the user's, not confirmed, or already gone.
     */
    async discardConfirmed(input: { userId: string; objectId: string }): Promise<boolean> {
      const claimed = await db.update(storageObjects).set({ status: "deleting" })
        .where(and(
          eq(storageObjects.id, input.objectId),
          eq(storageObjects.userId, input.userId),
          eq(storageObjects.status, "confirmed"),
        )).returning({ id: storageObjects.id });
      if (claimed.length === 0) return false;
      await removeClaimed().catch(() => {}); // a failure leaves it 'deleting' for the sweep
      return true;
    },

    /** Short-lived download URL. A foreign, unconfirmed or deleted object is indistinguishable: OBJECT_NOT_FOUND. */
    async getDownloadUrl(input: { userId: string; objectId: string; ttlSeconds?: number }): Promise<{ url: string; expiresAt: Date }> {
      const [row] = await db.select({ bucket: storageObjects.bucket, objectKey: storageObjects.objectKey })
        .from(storageObjects)
        .innerJoin(conversations, eq(conversations.id, storageObjects.conversationId))
        .where(and(
          eq(storageObjects.id, input.objectId),
          eq(storageObjects.userId, input.userId),
          eq(storageObjects.status, "confirmed"),
          isNull(conversations.deletedAt),
        )).limit(1);
      if (!row) throw new StorageError("OBJECT_NOT_FOUND");
      const ttl = Math.min(Math.max(Math.floor(input.ttlSeconds ?? limits.downloadUrlTtlSeconds), 1), limits.maxDownloadUrlTtlSeconds);
      const url = await client.createSignedDownloadUrl(row.bucket as BucketName, row.objectKey, ttl);
      return { url, expiresAt: new Date(now().getTime() + ttl * 1000) };
    },

    /**
     * Scheduled cleanup: (1) pending for over an hour, (2) audio older than 24 h,
     * (3) objects of a soft-deleted or vanished conversation, (4) objects of an anonymized
     * (self-deleted) account. Then retries any 'deleting' row and purges old 'deleted' rows.
     */
    async sweep(): Promise<SweepResult> {
      const at = now();
      const claimedRows = await db.update(storageObjects).set({ status: "deleting" })
        .where(and(
          inArray(storageObjects.status, ["pending", "confirmed"]),
          or(
            and(eq(storageObjects.status, "pending"), lt(storageObjects.createdAt, new Date(at.getTime() - limits.orphanAfterMs))),
            and(eq(storageObjects.bucket, "audio"), lt(storageObjects.createdAt, new Date(at.getTime() - limits.audioMaxAgeMs))),
            isNull(storageObjects.conversationId),
            sql`${storageObjects.conversationId} IN (SELECT id FROM conversations WHERE deleted_at IS NOT NULL)`,
            sql`${storageObjects.userId} IN (SELECT id FROM users WHERE email LIKE ${ANONYMIZED_EMAIL_LIKE})`,
          ),
        )).returning({ id: storageObjects.id });

      const { removed, failed } = await removeClaimed();

      const purgedRows = await db.delete(storageObjects)
        .where(and(eq(storageObjects.status, "deleted"), lt(storageObjects.deletedAt, new Date(at.getTime() - limits.purgeDeletedAfterMs))))
        .returning({ id: storageObjects.id });

      return { claimed: claimedRows.length, removed, failed, purged: purgedRows.length };
    },
  };
}

export type StorageService = ReturnType<typeof createStorageService>;

let shared: StorageService | null | undefined;

/** Service bound to the env-configured client, or null when storage is not configured. */
export function getStorageService(): StorageService | null {
  if (shared === undefined) {
    const client = getStorageClient();
    shared = client ? createStorageService({ client }) : null;
  }
  return shared;
}
