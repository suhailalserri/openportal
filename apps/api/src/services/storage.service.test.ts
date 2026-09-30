import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDb, stopTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";
import type { StorageClient } from "./storage.client";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let mod: typeof import("./storage.service");
let orm: typeof import("drizzle-orm");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/db/src/migrations/0021_storage_objects.sql");

class FakeStorage implements StorageClient {
  objects = new Map<string, number>();        // "bucket/key" -> size
  signUploadCalls = 0;
  failSign = false;
  failRemove = false;
  async ensureBucket() { return "created" as const; }
  async createSignedUploadUrl(bucket: string, key: string) {
    this.signUploadCalls++;
    if (this.failSign) throw new Error("sign failed");
    return `https://fake.test/upload/${bucket}/${key}?token=x`;
  }
  async createSignedDownloadUrl(bucket: string, key: string, ttl: number) { return `https://fake.test/dl/${bucket}/${key}?ttl=${ttl}`; }
  async getObjectInfo(bucket: string, key: string) {
    const s = this.objects.get(`${bucket}/${key}`);
    return s === undefined ? null : { sizeBytes: s };
  }
  async removeObjects(bucket: string, keys: string[]) {
    if (this.failRemove) throw new Error("remove failed");
    for (const k of keys) this.objects.delete(`${bucket}/${k}`);
  }
  put(bucket: string, key: string, size: number) { this.objects.set(`${bucket}/${key}`, size); }
  has(bucket: string, key: string) { return this.objects.has(`${bucket}/${key}`); }
}

let fake: FakeStorage;
let clock: Date;
const svc = (limits: Record<string, number> = {}) =>
  mod.createStorageService({ client: fake, now: () => clock, limits });

async function conv(userId: string, deleted = false) {
  const id = randomUUID();
  await db.insert(schema.conversations).values({ id, userId, deletedAt: deleted ? new Date() : null });
  return id;
}
const rowOf = async (id: string) => (await db.select().from(schema.storageObjects).where(orm.eq(schema.storageObjects.id, id)))[0];
const PDF = { bucket: "attachments", mimeType: "application/pdf" };

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  orm = await import("drizzle-orm");
  mod = await import("./storage.service");
}, 60_000);
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => {
  await db.delete(schema.storageObjects);
  fake = new FakeStorage();
  clock = new Date("2026-10-01T12:00:00Z");
});

describe("requestUpload", () => {
  it("rejects oversized / wrong-type / bad-size files BEFORE signing or writing a row", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc();
    for (const bad of [
      { ...PDF, sizeBytes: 21 * 1024 * 1024, code: "FILE_TOO_LARGE" },
      { bucket: "attachments", mimeType: "application/zip", sizeBytes: 10, code: "INVALID_MIME" },
      { ...PDF, sizeBytes: 0, code: "INVALID_SIZE" },
      { bucket: "nope", mimeType: "application/pdf", sizeBytes: 10, code: "INVALID_BUCKET" },
    ]) {
      await expect(s.requestUpload({ userId, conversationId, ...bad })).rejects.toMatchObject({ code: bad.code });
    }
    expect(fake.signUploadCalls).toBe(0);
    expect(await db.select().from(schema.storageObjects)).toHaveLength(0);
  });

  it("issues a URL scoped to {userId}/{conversationId}/{uuid} and records a pending row", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const t = await svc().requestUpload({ userId, conversationId, ...PDF, sizeBytes: 500 });
    expect(t.objectKey).toBe(`${userId}/${conversationId}/${t.objectId}`);
    expect(t.uploadUrl).toContain(t.objectKey);
    const r = await rowOf(t.objectId);
    expect(r).toMatchObject({ status: "pending", bucket: "attachments", declaredSizeBytes: 500, userId, conversationId });
  });

  it("refuses another user's conversation and a soft-deleted one", async () => {
    const a = await createTestUser(db, schema);
    const b = await createTestUser(db, schema);
    const aConv = await conv(a.userId);
    const aDeleted = await conv(a.userId, true);
    await expect(svc().requestUpload({ userId: b.userId, conversationId: aConv, ...PDF, sizeBytes: 5 }))
      .rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    await expect(svc().requestUpload({ userId: a.userId, conversationId: aDeleted, ...PDF, sizeBytes: 5 }))
      .rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    expect(fake.signUploadCalls).toBe(0);
  });

  it("enforces the total-bytes quota", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc({ maxTotalBytesPerUser: 1000 });
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 600 });
    await expect(s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 401 })).rejects.toMatchObject({ code: "QUOTA_BYTES" });
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 400 });
  });

  it("enforces the per-day upload count, and it rolls off after 24 h", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc({ maxUploadsPerDay: 2 });
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 });
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 });
    await expect(s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 })).rejects.toMatchObject({ code: "QUOTA_DAILY" });
    clock = new Date(clock.getTime() + DAY + 1000);
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 });
  });

  it("holds the daily cap under concurrency (5 parallel, cap 2 => exactly 2)", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc({ maxUploadsPerDay: 2 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.select().from(schema.storageObjects)).toHaveLength(2);
  });

  it("does not charge quota when signing fails", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc({ maxUploadsPerDay: 1 });
    fake.failSign = true;
    await expect(s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 })).rejects.toThrow();
    expect(await db.select().from(schema.storageObjects)).toHaveLength(0);
    fake.failSign = false;
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 });
  });
});

describe("confirmUpload + getDownloadUrl", () => {
  async function pending(size = 1000) {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const t = await svc().requestUpload({ userId, conversationId, ...PDF, sizeBytes: size });
    return { userId, conversationId, t };
  }

  it("confirm fails while the object is not there, and works once it is (idempotent)", async () => {
    const { userId, t } = await pending();
    await expect(svc().confirmUpload({ userId, objectId: t.objectId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    expect((await rowOf(t.objectId))!.status).toBe("pending");
    fake.put("attachments", t.objectKey, 900);
    expect(await svc().confirmUpload({ userId, objectId: t.objectId })).toEqual({ objectId: t.objectId, sizeBytes: 900 });
    expect(await svc().confirmUpload({ userId, objectId: t.objectId })).toEqual({ objectId: t.objectId, sizeBytes: 900 });
    expect(await rowOf(t.objectId)).toMatchObject({ status: "confirmed", sizeBytes: 900 });
  });

  it("an upload bigger than declared is rejected and the object is removed", async () => {
    const { userId, t } = await pending(1000);
    fake.put("attachments", t.objectKey, 5000);
    await expect(svc().confirmUpload({ userId, objectId: t.objectId })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(fake.has("attachments", t.objectKey)).toBe(false);
    expect((await rowOf(t.objectId))!.status).toBe("deleted");
  });

  it("another user cannot confirm or download your object", async () => {
    const { userId, t } = await pending();
    const other = await createTestUser(db, schema);
    fake.put("attachments", t.objectKey, 10);
    await expect(svc().confirmUpload({ userId: other.userId, objectId: t.objectId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    await svc().confirmUpload({ userId, objectId: t.objectId });
    await expect(svc().getDownloadUrl({ userId: other.userId, objectId: t.objectId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });

  it("issues a short-lived URL to the owner only after confirmation, TTL clamped", async () => {
    const { userId, conversationId, t } = await pending();
    await expect(svc().getDownloadUrl({ userId, objectId: t.objectId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" }); // still pending
    fake.put("attachments", t.objectKey, 10);
    await svc().confirmUpload({ userId, objectId: t.objectId });
    const d = await svc().getDownloadUrl({ userId, objectId: t.objectId });
    expect(d.url).toContain("ttl=300");
    expect(d.expiresAt.getTime()).toBe(clock.getTime() + 300_000);
    expect((await svc().getDownloadUrl({ userId, objectId: t.objectId, ttlSeconds: 99999 })).url).toContain("ttl=900");
    await db.update(schema.conversations).set({ deletedAt: new Date() }).where(orm.eq(schema.conversations.id, conversationId));
    await expect(svc().getDownloadUrl({ userId, objectId: t.objectId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});

describe("sweep (orphans + deletion cascade)", () => {
  async function upload(opts: { userId: string; conversationId: string; bucket?: string; mimeType?: string; confirm?: boolean }) {
    const bucket = opts.bucket ?? "attachments";
    const t = await svc().requestUpload({
      userId: opts.userId, conversationId: opts.conversationId, bucket,
      mimeType: opts.mimeType ?? "application/pdf", sizeBytes: 100,
    });
    fake.put(bucket, t.objectKey, 100);
    if (opts.confirm) await svc().confirmUpload({ userId: opts.userId, objectId: t.objectId });
    return t;
  }
  const advance = (ms: number) => { clock = new Date(clock.getTime() + ms); };

  it("removes orphans never confirmed within 1 h and keeps fresh ones", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const old = await upload({ userId, conversationId });
    advance(HOUR + 1000);
    const fresh = await upload({ userId, conversationId });
    const r = await svc().sweep();
    expect(r).toMatchObject({ claimed: 1, removed: 1, failed: 0 });
    expect(fake.has("attachments", old.objectKey)).toBe(false);
    expect(fake.has("attachments", fresh.objectKey)).toBe(true);
    expect((await rowOf(old.objectId))!.status).toBe("deleted");
    expect((await rowOf(fresh.objectId))!.status).toBe("pending");
  });

  it("keeps confirmed attachments of a live conversation, even when old", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const t = await upload({ userId, conversationId, confirm: true });
    advance(30 * DAY);
    expect(await svc().sweep()).toMatchObject({ claimed: 0 });
    expect(fake.has("attachments", t.objectKey)).toBe(true);
  });

  it("removes audio older than 24 h (safety net) but not younger audio", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const a = await upload({ userId, conversationId, bucket: "audio", mimeType: "audio/webm", confirm: true });
    advance(23 * HOUR);
    expect((await svc().sweep()).claimed).toBe(0);
    advance(2 * HOUR);
    expect((await svc().sweep()).claimed).toBe(1);
    expect(fake.has("audio", a.objectKey)).toBe(false);
  });

  it("deletion cascade: deleting a conversation removes its objects only", async () => {
    const { userId } = await createTestUser(db, schema);
    const c1 = await conv(userId);
    const c2 = await conv(userId);
    const gone = await upload({ userId, conversationId: c1, confirm: true });
    const kept = await upload({ userId, conversationId: c2, confirm: true });
    await db.update(schema.conversations).set({ deletedAt: new Date() }).where(orm.eq(schema.conversations.id, c1));
    const r = await svc().sweep();
    expect(r).toMatchObject({ claimed: 1, removed: 1 });
    expect(fake.has("attachments", gone.objectKey)).toBe(false);
    expect(fake.has("attachments", kept.objectKey)).toBe(true);
  });

  it("deletion cascade: an anonymized (self-deleted) account loses all objects; others keep theirs", async () => {
    const victim = await createTestUser(db, schema);
    const other = await createTestUser(db, schema);
    const vt = await upload({ userId: victim.userId, conversationId: await conv(victim.userId), confirm: true });
    const ot = await upload({ userId: other.userId, conversationId: await conv(other.userId), confirm: true });
    await db.update(schema.users).set({ email: `deleted-${victim.userId}@deleted.invalid` }).where(orm.eq(schema.users.id, victim.userId));
    await svc().sweep();
    expect(fake.has("attachments", vt.objectKey)).toBe(false);
    expect(fake.has("attachments", ot.objectKey)).toBe(true);
  });

  it("an object whose conversation row vanished (SET NULL) is removed", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const t = await upload({ userId, conversationId, confirm: true });
    await db.delete(schema.conversations).where(orm.eq(schema.conversations.id, conversationId));
    await svc().sweep();
    expect(fake.has("attachments", t.objectKey)).toBe(false);
  });

  it("a failed storage removal leaves the row 'deleting' and the next sweep retries it", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const t = await upload({ userId, conversationId });
    advance(2 * HOUR);
    fake.failRemove = true;
    expect(await svc().sweep()).toMatchObject({ claimed: 1, removed: 0, failed: 1 });
    expect((await rowOf(t.objectId))!.status).toBe("deleting");
    expect(fake.has("attachments", t.objectKey)).toBe(true);
    fake.failRemove = false;
    expect(await svc().sweep()).toMatchObject({ claimed: 0, removed: 1, failed: 0 });
    expect(fake.has("attachments", t.objectKey)).toBe(false);
  });

  it("swept objects free the byte quota; 'deleted' rows still count toward the daily cap, then purge", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc({ maxTotalBytesPerUser: 100, maxUploadsPerDay: 2 });
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 100 });
    advance(2 * HOUR);
    await s.sweep();
    // bytes freed, and the old row is >24 h? no: 2 h old, so it still counts toward the daily cap (1 of 2)
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 100 });
    await expect(s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 })).rejects.toMatchObject({ code: "QUOTA_DAILY" });
    advance(3 * DAY);
    const r = await s.sweep();
    expect(r.purged).toBeGreaterThanOrEqual(1);
  });

  it("is a no-op on an empty table", async () => {
    expect(await svc().sweep()).toEqual({ claimed: 0, removed: 0, failed: 0, purged: 0 });
  });
});

describe("migration 0021", () => {
  it("is re-runnable and adds the status CHECK", async () => {
    const sqlText = fs.readFileSync(MIGRATION, "utf-8");
    await db.execute(orm.sql.raw(sqlText));
    await db.execute(orm.sql.raw(sqlText));
    const { userId } = await createTestUser(db, schema);
    await expect(db.insert(schema.storageObjects).values({
      userId, bucket: "attachments", objectKey: `bad/${randomUUID()}`, mimeType: "application/pdf",
      declaredSizeBytes: 1, status: "bogus",
    })).rejects.toThrow();
  });
});

// ── P5.3: voice notes (audio bucket, no conversation) ───────────────────────────────────────
describe("voice notes (P5.3)", () => {
  const WEBM = { bucket: "audio", mimeType: "audio/webm" };
  const HOUR_MS = 60 * 60 * 1000;

  it("an audio upload needs no conversation: row has none, key uses the all-zero segment", async () => {
    const { userId } = await createTestUser(db, schema);
    const t = await svc().requestUpload({ userId, ...WEBM, sizeBytes: 5000 });
    const { NO_CONVERSATION_SEGMENT, parseObjectKey } = await import("./storage.policy");
    expect(t.objectKey).toBe(`${userId}/${NO_CONVERSATION_SEGMENT}/${t.objectId}`);
    expect(parseObjectKey(t.objectKey)).not.toBeNull();
    const row = await rowOf(t.objectId);
    expect(row?.conversationId).toBeNull();
    expect(row?.status).toBe("pending");
  });

  it("an attachment still REQUIRES a live conversation", async () => {
    const { userId } = await createTestUser(db, schema);
    await expect(svc().requestUpload({ userId, ...PDF, sizeBytes: 10 })).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    await expect(svc().requestUpload({ userId, conversationId: null, ...PDF, sizeBytes: 10 })).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
  });

  it("confirm works without a conversation, and only for the owner", async () => {
    const { userId } = await createTestUser(db, schema);
    const other = await createTestUser(db, schema);
    const t = await svc().requestUpload({ userId, ...WEBM, sizeBytes: 5000 });
    fake.put("audio", t.objectKey, 5000);
    await expect(svc().confirmUpload({ userId: other.userId, objectId: t.objectId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    expect(await svc().confirmUpload({ userId, objectId: t.objectId })).toEqual({ objectId: t.objectId, sizeBytes: 5000 });
  });

  it("sweep keeps a FRESH conversation-less voice note (RED: the no-conversation rule used to claim it at once)", async () => {
    const { userId } = await createTestUser(db, schema);
    const t = await svc().requestUpload({ userId, ...WEBM, sizeBytes: 5000 });
    fake.put("audio", t.objectKey, 5000);
    await svc().confirmUpload({ userId, objectId: t.objectId });
    expect((await svc().sweep()).claimed).toBe(0);
    expect(fake.has("audio", t.objectKey)).toBe(true);
    clock = new Date(clock.getTime() + 25 * HOUR_MS); // the 24 h audio safety net still applies
    expect((await svc().sweep()).claimed).toBe(1);
    expect(fake.has("audio", t.objectKey)).toBe(false);
  });

  it("voice notes have their own daily cap and do not use up the attachment cap", async () => {
    const { userId } = await createTestUser(db, schema);
    const conversationId = await conv(userId);
    const s = svc({ maxUploadsPerDay: 1, maxAudioUploadsPerDay: 2 });
    await s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 });
    await s.requestUpload({ userId, ...WEBM, sizeBytes: 1 });
    await s.requestUpload({ userId, ...WEBM, sizeBytes: 1 });
    await expect(s.requestUpload({ userId, ...WEBM, sizeBytes: 1 })).rejects.toMatchObject({ code: "QUOTA_DAILY" });
    await expect(s.requestUpload({ userId, conversationId, ...PDF, sizeBytes: 1 })).rejects.toMatchObject({ code: "QUOTA_DAILY" });
  });

  it("discardConfirmed removes a voice note at once (what transcription does after billing)", async () => {
    const { userId } = await createTestUser(db, schema);
    const t = await svc().requestUpload({ userId, ...WEBM, sizeBytes: 5000 });
    fake.put("audio", t.objectKey, 5000);
    await svc().confirmUpload({ userId, objectId: t.objectId });
    expect(await svc().discardConfirmed({ userId, objectId: t.objectId })).toBe(true);
    expect(fake.has("audio", t.objectKey)).toBe(false);
    expect((await rowOf(t.objectId))?.status).toBe("deleted");
  });
});
