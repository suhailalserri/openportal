import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDb, stopTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";
import { makePdf } from "../test/fixtures";
import type { StorageClient } from "./storage.client";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let storageMod: typeof import("./storage.service");
let attMod: typeof import("./attachments.service");
let resolveMod: typeof import("./chat-attachments.service");
let orm: typeof import("drizzle-orm");

const MiB = 1024 * 1024;
const VISION = { supportsVision: true, categories: [] as string[] };
const TEXT_ONLY = { supportsVision: false, categories: [] as string[] };

// Smallest valid PNG (1x1) built by hand: signature + IHDR + IDAT + IEND (CRCs are not checked).
const chunk = (type: string, data: number[]) => {
  const len = data.length;
  return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
};
const png = (w = 1, h = 1, extra: number[] = []) => Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...chunk("IHDR", [0, 0, (w >> 8) & 255, w & 255, 0, 0, (h >> 8) & 255, h & 255, 8, 2, 0, 0, 0]),
  ...extra,
  ...chunk("IDAT", [1, 2, 3]),
  ...chunk("IEND", []),
]);
const textChunk = chunk("tEXt", [...new TextEncoder().encode("Author\0LEAKED-NAME")]);

class FakeStorage implements StorageClient {
  objects = new Map<string, number>();
  blobs = new Map<string, Uint8Array>();
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
}

let fake: FakeStorage;
const fetchImpl = (async (url: string | URL | Request) => {
  const b = fake.blobs.get(String(url).split("?")[0]!);
  return b ? new Response(b as any) : new Response("nope", { status: 404 });
}) as typeof fetch;

const storage = () => storageMod.createStorageService({ client: fake, now: () => new Date() });
const resolve = (args: Parameters<typeof resolveMod.resolveChatAttachments>[0], storageOverride?: any) =>
  resolveMod.resolveChatAttachments(args, { storage: storageOverride === undefined ? storage() : storageOverride, fetchImpl });

async function conv(userId: string) {
  const id = randomUUID();
  await db.insert(schema.conversations).values({ id, userId });
  return id;
}

/** Real createUpload (so the storage_objects FK row exists), then the row is set to `ready`. */
async function readyAttachment(o: {
  userId: string; conversationId: string; mime: string; bytes: Uint8Array;
  text?: string | null; status?: string; fileName?: string; truncated?: boolean; declaredSize?: number; kind?: string;
}) {
  const svc = attMod.createAttachmentsService({ storage: storage(), enqueue: vi.fn(async () => {}), fetchImpl });
  const t = await svc.createUpload({
    userId: o.userId, conversationId: o.conversationId, fileName: o.fileName ?? "f", mimeType: o.mime,
    sizeBytes: o.declaredSize ?? o.bytes.length,
  });
  const [obj] = await db.select().from(schema.storageObjects).where(orm.eq(schema.storageObjects.id, t.attachmentId));
  fake.put("attachments", obj!.objectKey, o.bytes);
  await db.update(schema.storageObjects).set({ status: "confirmed" }).where(orm.eq(schema.storageObjects.id, t.attachmentId));
  await db.update(schema.attachments).set({
    status: o.status ?? "ready",
    extractedText: o.text === undefined ? null : o.text,
    truncated: o.truncated ?? false,
    ...(o.kind ? { kind: o.kind } : {}),
  }).where(orm.eq(schema.attachments.id, t.attachmentId));
  return t.attachmentId;
}

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  orm = await import("drizzle-orm");
  storageMod = await import("./storage.service");
  attMod = await import("./attachments.service");
  resolveMod = await import("./chat-attachments.service");
}, 60_000);
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => {
  await db.delete(schema.attachments);
  await db.delete(schema.storageObjects);
  fake = new FakeStorage();
});

describe("resolveChatAttachments — documents", () => {
  it("returns the stored text of a ready document, in request order, with its file name and cut flag", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const a = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("a"), text: "TEXT-A", fileName: "a.pdf" });
    const b = await readyAttachment({ userId, conversationId: c, mime: "text/plain", bytes: new TextEncoder().encode("b"), text: "TEXT-B", fileName: "b.txt", truncated: true });
    const r = await resolve({ userId, conversationId: c, ids: [b, a], model: TEXT_ONLY });
    expect(r.images).toEqual([]);
    expect(r.documents).toEqual([
      { fileName: "b.txt", text: "TEXT-B", truncatedAtExtract: true },
      { fileName: "a.pdf", text: "TEXT-A", truncatedAtExtract: false },
    ]);
  });

  it("a document works on a model WITHOUT vision", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const a = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("a"), text: "T" });
    await expect(resolve({ userId, conversationId: c, ids: [a], model: TEXT_ONLY })).resolves.toMatchObject({ documents: [{ text: "T" }] });
  });
});

describe("resolveChatAttachments — rejections", () => {
  it("someone else's attachment id is ATTACHMENT_NOT_FOUND (same as a missing id)", async () => {
    const a = await createTestUser(db, schema);
    const b = await createTestUser(db, schema);
    const ca = await conv(a.userId), cb = await conv(b.userId);
    const id = await readyAttachment({ userId: a.userId, conversationId: ca, mime: "application/pdf", bytes: makePdf("x"), text: "SECRET" });
    await expect(resolve({ userId: b.userId, conversationId: cb, ids: [id], model: TEXT_ONLY })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
    await expect(resolve({ userId: b.userId, conversationId: cb, ids: [randomUUID()], model: TEXT_ONLY })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
  });

  it("an attachment from ANOTHER conversation of the same user is ATTACHMENT_NOT_FOUND", async () => {
    const { userId } = await createTestUser(db, schema);
    const c1 = await conv(userId), c2 = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c1, mime: "application/pdf", bytes: makePdf("x"), text: "T" });
    await expect(resolve({ userId, conversationId: c2, ids: [id], model: TEXT_ONLY })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
  });

  it("one bad id rejects the whole request (nothing is silently dropped)", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const ok = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("x"), text: "T" });
    await expect(resolve({ userId, conversationId: c, ids: [ok, randomUUID()], model: TEXT_ONLY })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
  });

  it.each(["uploading", "processing", "failed"])("status %s is ATTACHMENT_NOT_READY", async (status) => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("x"), text: null, status });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: TEXT_ONLY })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
  });

  it("a ready document with no stored text (e.g. cleared by the sweep) is ATTACHMENT_NOT_READY", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("x"), text: null });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: TEXT_ONLY })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
  });

  it("more than 5 attachments is TOO_MANY_ATTACHMENTS (before any DB read)", async () => {
    const { userId } = await createTestUser(db, schema);
    const ids = Array.from({ length: 6 }, () => randomUUID());
    await expect(resolve({ userId, conversationId: randomUUID(), ids, model: TEXT_ONLY })).rejects.toMatchObject({ code: "TOO_MANY_ATTACHMENTS" });
  });

  it("an image on a non-vision model is VISION_NOT_SUPPORTED; `categories: [vision]` also counts as vision", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "image/png", bytes: png() });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: TEXT_ONLY })).rejects.toMatchObject({ code: "VISION_NOT_SUPPORTED" });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: { supportsVision: false, categories: ["vision"] } })).resolves.toMatchObject({ images: [expect.any(String)] });
  });

  it("an audio attachment is ATTACHMENT_UNSUPPORTED in chat", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    // The attachments bucket never accepts audio (P5.3 uses its own bucket), so force the kind on a stored row.
    const id = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("x"), text: null, kind: "audio" });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: VISION })).rejects.toMatchObject({ code: "ATTACHMENT_UNSUPPORTED" });
  });

  it("an image over 5 MiB is ATTACHMENT_UNSUPPORTED even though the bucket allows 20 MiB", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "image/png", bytes: png(), declaredSize: 5 * MiB + 1 });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: VISION })).rejects.toMatchObject({ code: "ATTACHMENT_UNSUPPORTED" });
  });
});

describe("resolveChatAttachments — images", () => {
  it("returns a data URL of the sanitized bytes: metadata chunks are gone", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "image/png", bytes: png(40, 30, textChunk) });
    const r = await resolve({ userId, conversationId: c, ids: [id], model: VISION });
    expect(r.documents).toEqual([]);
    expect(r.images).toHaveLength(1);
    expect(r.images[0]!.startsWith("data:image/png;base64,")).toBe(true);
    const decoded = Buffer.from(r.images[0]!.split(",")[1]!, "base64");
    expect(decoded.includes(Buffer.from("LEAKED-NAME"))).toBe(false);
    expect(decoded.includes(Buffer.from("IDAT"))).toBe(true);
  });

  it("an image whose real bytes are not its declared type is ATTACHMENT_UNSUPPORTED", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "image/jpeg", bytes: png() });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: VISION })).rejects.toMatchObject({ code: "ATTACHMENT_UNSUPPORTED" });
  });

  it("an image with absurd dimensions is ATTACHMENT_UNSUPPORTED", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "image/png", bytes: png(9_000, 10) });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: VISION })).rejects.toMatchObject({ code: "ATTACHMENT_UNSUPPORTED" });
  });

  it("a stored object that cannot be read back is ATTACHMENT_NOT_READY; storage off is too", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const id = await readyAttachment({ userId, conversationId: c, mime: "image/png", bytes: png() });
    fake.blobs.clear(); // download URL now answers 404
    await expect(resolve({ userId, conversationId: c, ids: [id], model: VISION })).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
    await expect(resolve({ userId, conversationId: c, ids: [id], model: VISION }, null)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
  });

  it("mixes a document and an image in one request", async () => {
    const { userId } = await createTestUser(db, schema);
    const c = await conv(userId);
    const d = await readyAttachment({ userId, conversationId: c, mime: "application/pdf", bytes: makePdf("x"), text: "DOC" });
    const i = await readyAttachment({ userId, conversationId: c, mime: "image/png", bytes: png() });
    const r = await resolve({ userId, conversationId: c, ids: [d, i], model: VISION });
    expect(r.documents).toHaveLength(1);
    expect(r.images).toHaveLength(1);
  });
});
