import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDb, stopTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";
import { makeDocx, makePdf, PNG_BYTES, utf8 } from "../test/fixtures";
import type { StorageClient } from "./storage.client";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let storageMod: typeof import("./storage.service");
let attMod: typeof import("./attachments.service");
let policy: typeof import("./attachments.policy");
let extractMod: typeof import("../extraction/extract");
let runnerMod: typeof import("../extraction/extraction.runner");
let orm: typeof import("drizzle-orm");

const MIN = 60 * 1000;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/db/src/migrations/0022_attachments.sql");

class FakeStorage implements StorageClient {
  objects = new Map<string, number>();            // "bucket/key" -> size
  blobs = new Map<string, Uint8Array>();          // download URL (no query) -> bytes
  async ensureBucket() { return "created" as const; }
  async createSignedUploadUrl(bucket: string, key: string) { return `https://fake.test/upload/${bucket}/${key}?token=x`; }
  async createSignedDownloadUrl(bucket: string, key: string, ttl: number) { return `https://fake.test/dl/${bucket}/${key}?ttl=${ttl}`; }
  async getObjectInfo(bucket: string, key: string) {
    const s = this.objects.get(`${bucket}/${key}`);
    return s === undefined ? null : { sizeBytes: s };
  }
  async removeObjects(bucket: string, keys: string[]) { for (const k of keys) this.objects.delete(`${bucket}/${k}`); }
  put(bucket: string, key: string, bytes: Uint8Array) {
    this.objects.set(`${bucket}/${key}`, bytes.length);
    this.blobs.set(`https://fake.test/dl/${bucket}/${key}`, bytes);
  }
  has(bucket: string, key: string) { return this.objects.has(`${bucket}/${key}`); }
}

let fake: FakeStorage;
let clock: Date;
let enqueue: ReturnType<typeof vi.fn>;
let tmp: string;

const fetchImpl = (async (url: string | URL | Request) => {
  const b = fake.blobs.get(String(url).split("?")[0]!);
  return b ? new Response(b as any) : new Response("nope", { status: 404 });
}) as typeof fetch;

const storage = () => storageMod.createStorageService({ client: fake, now: () => clock });
const svc = (over: Partial<Parameters<typeof attMod.createAttachmentsService>[0]> = {}) =>
  attMod.createAttachmentsService({
    storage: storage(), enqueue: enqueue as any, extract: extractMod.extractDocumentText,
    fetchImpl, now: () => clock, ...over,
  });

async function conv(userId: string, deleted = false) {
  const id = randomUUID();
  await db.insert(schema.conversations).values({ id, userId, deletedAt: deleted ? new Date() : null });
  return id;
}
const rowOf = async (id: string) => (await db.select().from(schema.attachments).where(orm.eq(schema.attachments.id, id)))[0]!;
const objOf = async (id: string) => (await db.select().from(schema.storageObjects).where(orm.eq(schema.storageObjects.id, id)))[0]!;

/** createUpload + put the bytes in fake storage (what the browser's PUT would do). */
async function upload(userId: string, conversationId: string, mimeType: string, bytes: Uint8Array, fileName = "f") {
  const t = await svc().createUpload({ userId, conversationId, fileName, mimeType, sizeBytes: bytes.length });
  fake.put("attachments", (await objOf(t.attachmentId)).objectKey, bytes);
  return t.attachmentId;
}
/** ...and confirm: the row is now `processing` with a job queued. */
async function uploaded(userId: string, conversationId: string, mimeType: string, bytes: Uint8Array) {
  const id = await upload(userId, conversationId, mimeType, bytes);
  await svc().confirm({ userId, attachmentId: id });
  return id;
}

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  orm = await import("drizzle-orm");
  storageMod = await import("./storage.service");
  attMod = await import("./attachments.service");
  policy = await import("./attachments.policy");
  extractMod = await import("../extraction/extract");
  runnerMod = await import("../extraction/extraction.runner");
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aip-att-"));
}, 60_000);
afterAll(async () => { fs.rmSync(tmp, { recursive: true, force: true }); await stopTestDb(); });
beforeEach(async () => {
  await db.delete(schema.attachments);
  await db.delete(schema.storageObjects);
  fake = new FakeStorage();
  clock = new Date("2026-10-01T12:00:00Z");
  enqueue = vi.fn(async () => {});
});

describe("createUpload", () => {
  it("records an `uploading` attachment with a sanitized name and the storage object's id", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const t = await svc().createUpload({ userId, conversationId: c, fileName: "../../my\nfile.pdf", mimeType: "application/pdf", sizeBytes: 1234 });
    expect(t.uploadUrl).toContain("https://fake.test/upload/attachments/");
    expect(t.kind).toBe("document");
    expect(t.fileName).toBe("myfile.pdf");
    const r = await rowOf(t.attachmentId);
    expect(r).toMatchObject({ userId, conversationId: c, status: "uploading", kind: "document", sizeBytes: 1234, fileName: "myfile.pdf" });
    expect((await objOf(t.attachmentId)).status).toBe("pending");
  });

  it("rejects oversize / bad type / foreign conversation before anything is stored", async () => {
    const a = await createTestUser(db, schema);
    const b = await createTestUser(db, schema);
    const c = await conv(a.userId);
    const s = svc();
    const cases = [
      { userId: a.userId, conversationId: c, mimeType: "application/pdf", sizeBytes: 21 * 1024 * 1024, code: "FILE_TOO_LARGE" },
      { userId: a.userId, conversationId: c, mimeType: "application/zip", sizeBytes: 10, code: "INVALID_MIME" },
      { userId: a.userId, conversationId: c, mimeType: "image/svg+xml", sizeBytes: 10, code: "INVALID_MIME" },
      { userId: b.userId, conversationId: c, mimeType: "application/pdf", sizeBytes: 10, code: "CONVERSATION_NOT_FOUND" },
    ];
    for (const { code, ...input } of cases) {
      await expect(s.createUpload({ ...input, fileName: "x" })).rejects.toMatchObject({ code });
    }
    expect(await db.select().from(schema.attachments)).toHaveLength(0);
    expect(await db.select().from(schema.storageObjects)).toHaveLength(0);
  });
});

describe("confirm", () => {
  it("queues extraction exactly once, even when confirm is called twice", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await upload(userId, c, "application/pdf", makePdf("hi"));
    const first = await svc().confirm({ userId, attachmentId: id });
    const second = await svc().confirm({ userId, attachmentId: id });
    expect(first.status).toBe("processing");
    expect(second.status).toBe("processing");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(id);
  });

  it("concurrent confirms still queue once", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await upload(userId, c, "application/pdf", makePdf("hi"));
    await Promise.all([1, 2, 3].map(() => svc().confirm({ userId, attachmentId: id }).catch(() => {})));
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("an object that was never uploaded stays `uploading`", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const t = await svc().createUpload({ userId, conversationId: c, fileName: "x", mimeType: "application/pdf", sizeBytes: 100 });
    await expect(svc().confirm({ userId, attachmentId: t.attachmentId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    expect((await rowOf(t.attachmentId)).status).toBe("uploading");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("a failed enqueue puts it back to `uploading`; a retry then works", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await upload(userId, c, "application/pdf", makePdf("hi"));
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    await expect(svc().confirm({ userId, attachmentId: id })).rejects.toMatchObject({ code: "QUEUE_UNAVAILABLE" });
    expect((await rowOf(id)).status).toBe("uploading");
    expect((await svc().confirm({ userId, attachmentId: id })).status).toBe("processing");
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("a foreign attachment id is NOT_FOUND for confirm and get, same as a missing one", async () => {
    const a = await createTestUser(db, schema);
    const b = await createTestUser(db, schema);
    const id = await upload(a.userId, await conv(a.userId), "application/pdf", makePdf("secret"));
    for (const fn of [
      () => svc().confirm({ userId: b.userId, attachmentId: id }),
      () => svc().get({ userId: b.userId, attachmentId: id }),
      () => svc().get({ userId: a.userId, attachmentId: randomUUID() }),
    ]) await expect(fn()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("process (the extraction job)", () => {
  it("PDF -> ready with the text, size, preview", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await uploaded(userId, await conv(userId), "application/pdf", makePdf("Invoice total is 42 dollars"));
    expect(await svc().process(id)).toBe("ready");
    const v = await svc().get({ userId, attachmentId: id });
    expect(v.status).toBe("ready");
    expect(v.preview).toContain("Invoice total is 42 dollars");
    expect(v.textChars).toBeGreaterThan(10);
    expect(v.errorCode).toBeNull();
    expect(Object.keys(v)).not.toContain("extractedText"); // the API never returns the full text
  });

  it("DOCX and TXT -> ready", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const d = await uploaded(userId, c, DOCX, makeDocx(["Word paragraph one", "Word paragraph two"]));
    const t = await uploaded(userId, c, "text/plain", utf8("plain text body"));
    expect(await svc().process(d)).toBe("ready");
    expect(await svc().process(t)).toBe("ready");
    expect((await rowOf(d)).extractedText).toBe("Word paragraph one\nWord paragraph two");
    expect((await rowOf(t)).extractedText).toBe("plain text body");
  });

  it("an image with real image bytes -> ready, no text", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await uploaded(userId, await conv(userId), "image/png", PNG_BYTES);
    expect(await svc().process(id)).toBe("ready");
    const r = await rowOf(id);
    expect(r).toMatchObject({ status: "ready", kind: "image", extractedText: null });
  });

  it("wrong real type -> failed TYPE_MISMATCH and the object is deleted", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await uploaded(userId, await conv(userId), "image/png", makePdf("i am a pdf, not a png"));
    const key = (await objOf(id)).objectKey;
    expect(await svc().process(id)).toBe("failed");
    expect(await rowOf(id)).toMatchObject({ status: "failed", errorCode: "TYPE_MISMATCH", extractedText: null });
    expect(fake.has("attachments", key)).toBe(false);
    expect((await objOf(id)).status).toBe("deleted");
  });

  it("corrupt and text-less files -> failed with the specific code", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const corrupt = await uploaded(userId, c, "application/pdf", utf8("%PDF-1.4\nnot really"));
    const scanned = await uploaded(userId, c, "application/pdf", makePdf(null));
    await svc().process(corrupt);
    await svc().process(scanned);
    expect((await rowOf(corrupt)).errorCode).toBe("CORRUPT");
    expect((await rowOf(scanned)).errorCode).toBe("NO_TEXT");
  });

  it("an extraction that hangs is killed and marks the attachment failed TIMEOUT", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await uploaded(userId, await conv(userId), "application/pdf", makePdf("anything"));
    const hang = path.join(tmp, "hang.mjs");
    fs.writeFileSync(hang, "while (true) {}");
    const s = svc({ extract: (m, b) => runnerMod.runExtraction(m, b, { workerFile: hang, timeoutMs: 300 }) });
    expect(await s.process(id)).toBe("failed");
    expect(await rowOf(id)).toMatchObject({ status: "failed", errorCode: "TIMEOUT", extractedText: null });
  });

  it("a download failure or a body larger than the recorded size -> failed DOWNLOAD_FAILED", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const gone = await uploaded(userId, c, "text/plain", utf8("abc"));
    fake.blobs.clear(); // storage 404s
    expect(await svc().process(gone)).toBe("failed");
    expect((await rowOf(gone)).errorCode).toBe("DOWNLOAD_FAILED");

    const big = await uploaded(userId, c, "text/plain", utf8("abc"));
    const key = (await objOf(big)).objectKey;
    fake.blobs.set(`https://fake.test/dl/attachments/${key}`, utf8("x".repeat(500))); // more than the 3 bytes recorded
    expect(await svc().process(big)).toBe("failed");
    expect((await rowOf(big)).errorCode).toBe("DOWNLOAD_FAILED");
  });

  it("is idempotent: a row that is not `processing` is skipped, and a finished one is not redone", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const fresh = await upload(userId, c, "text/plain", utf8("x")); // still `uploading`
    expect(await svc().process(fresh)).toBe("skipped");
    const id = await uploaded(userId, c, "text/plain", utf8("hello"));
    expect(await svc().process(id)).toBe("ready");
    expect(await svc().process(id)).toBe("skipped");
    expect(await svc().process(randomUUID())).toBe("skipped");
  });

  it("a sweep that failed the row while extraction ran wins (no resurrection)", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await uploaded(userId, await conv(userId), "text/plain", utf8("hello"));
    const s = svc({
      extract: async (m, b) => {
        await db.update(schema.attachments).set({ status: "failed", errorCode: "STALLED" }).where(orm.eq(schema.attachments.id, id));
        return extractMod.extractDocumentText(m, b);
      },
    });
    expect(await s.process(id)).toBe("skipped");
    expect(await rowOf(id)).toMatchObject({ status: "failed", errorCode: "STALLED", extractedText: null });
  });
});

describe("cleanup", () => {
  it("deleting the conversation removes the object AND the extracted text on the next sweep", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await uploaded(userId, c, "application/pdf", makePdf("private content"));
    await svc().process(id);
    const key = (await objOf(id)).objectKey;
    expect((await rowOf(id)).extractedText).toContain("private content");

    await db.update(schema.conversations).set({ deletedAt: new Date() }).where(orm.eq(schema.conversations.id, c));
    await storage().sweep();

    expect(fake.has("attachments", key)).toBe(false);
    expect(await rowOf(id)).toMatchObject({ status: "failed", errorCode: "OBJECT_DELETED", extractedText: null });
    await expect(svc().get({ userId, attachmentId: id })).resolves.toMatchObject({ status: "failed", preview: null });
  });

  it("an upload never confirmed within the hour is swept and its attachment row is failed", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await upload(userId, await conv(userId), "application/pdf", makePdf("x"));
    clock = new Date(clock.getTime() + 61 * MIN);
    await storage().sweep();
    expect(await rowOf(id)).toMatchObject({ status: "failed", errorCode: "OBJECT_DELETED" });
  });

  it("purging the storage row later removes the attachment row (ON DELETE CASCADE)", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await uploaded(userId, c, "text/plain", utf8("x"));
    await db.update(schema.conversations).set({ deletedAt: new Date() }).where(orm.eq(schema.conversations.id, c));
    await storage().sweep();
    clock = new Date(clock.getTime() + 3 * 24 * 60 * MIN);
    await storage().sweep();
    expect(await db.select().from(schema.attachments).where(orm.eq(schema.attachments.id, id))).toHaveLength(0);
  });

  it("sweepStalled fails a job stuck in `processing` and deletes its object", async () => {
    const { userId } = await createTestUser(db, schema);
    const id = await uploaded(userId, await conv(userId), "text/plain", utf8("x"));
    const key = (await objOf(id)).objectKey;
    expect(await svc().sweepStalled()).toBe(0); // too fresh
    clock = new Date(clock.getTime() + policy.ATTACHMENT_LIMITS.stalledAfterMs + MIN);
    expect(await svc().sweepStalled()).toBe(1);
    expect(await rowOf(id)).toMatchObject({ status: "failed", errorCode: "STALLED" });
    expect(fake.has("attachments", key)).toBe(false);
  });
});

describe("migration 0022", () => {
  it("is re-runnable and adds the status / kind CHECKs", async () => {
    const sqlText = fs.readFileSync(MIGRATION, "utf-8");
    await db.execute(orm.sql.raw(sqlText));
    await db.execute(orm.sql.raw(sqlText));
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const mk = async (over: Record<string, unknown>) => {
      const objId = randomUUID();
      await db.insert(schema.storageObjects).values({
        id: objId, userId, conversationId: c, bucket: "attachments", objectKey: `m/${objId}`,
        mimeType: "text/plain", declaredSizeBytes: 1, status: "confirmed",
      });
      return db.insert(schema.attachments).values({
        id: objId, userId, conversationId: c, fileName: "f", mimeType: "text/plain", sizeBytes: 1,
        kind: "document", status: "uploading", ...over,
      } as any);
    };
    await expect(mk({})).resolves.toBeDefined();
    await expect(mk({ status: "bogus" })).rejects.toThrow();
    await expect(mk({ kind: "video" })).rejects.toThrow();
  });
});
