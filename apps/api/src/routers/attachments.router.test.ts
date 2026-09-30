/**
 * P5.2a: the attachments tRPC surface, without a database: guard, input bounds, error-code
 * mapping and "the user id comes from the session, never from the input".
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const getSvc = vi.hoisted(() => vi.fn());
vi.mock("../services/attachments.service", () => ({ getAttachmentsService: getSvc }));

import { createCallerFactory } from "./trpc";
import { attachmentsRouter } from "./attachments.router";
import { StorageError, type StorageErrorCode } from "../services/storage.policy";
import { AttachmentError } from "../services/attachments.policy";

const base = { status: "active", isFraudFlagged: false };
const userId = randomUUID();
const caller = (user: object | null) =>
  createCallerFactory(attachmentsRouter)({ db: {} as any, user, ip: "203.0.113.9" } as any);
const signedIn = () => caller({ id: userId, role: "user", ...base });

const MiB = 1024 * 1024;
const validUpload = () => ({ conversationId: randomUUID(), fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1000 });
const fakeSvc = () => ({ createUpload: vi.fn(), confirm: vi.fn(), get: vi.fn() });

beforeEach(() => getSvc.mockReset());

describe("guard", () => {
  it("needs a signed-in, usable account", async () => {
    getSvc.mockReturnValue(fakeSvc());
    await expect(caller(null).createUploadUrl(validUpload())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).get({ attachmentId: randomUUID() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller({ id: userId, role: "user", status: "suspended", isFraudFlagged: false }).confirm({ attachmentId: randomUUID() }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("input bounds (rejected before the service is touched)", () => {
  it.each([
    ["size over the 20 MiB bucket limit", { sizeBytes: 20 * MiB + 1 }],
    ["size 0", { sizeBytes: 0 }],
    ["fractional size", { sizeBytes: 1.5 }],
    ["file name 256 chars", { fileName: "x".repeat(256) }],
    ["empty file name", { fileName: "" }],
    ["mime 101 chars", { mimeType: "x".repeat(101) }],
    ["non-uuid conversation id", { conversationId: "not-a-uuid" }],
  ])("createUploadUrl: %s", async (_name, over) => {
    const svc = fakeSvc();
    getSvc.mockReturnValue(svc);
    await expect(signedIn().createUploadUrl({ ...validUpload(), ...over })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(svc.createUpload).not.toHaveBeenCalled();
  });

  it("confirm / get need a uuid", async () => {
    const svc = fakeSvc();
    getSvc.mockReturnValue(svc);
    await expect(signedIn().confirm({ attachmentId: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(signedIn().get({ attachmentId: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("behaviour", () => {
  it("uses the session's user id, and ignores any userId in the input", async () => {
    const svc = fakeSvc();
    svc.createUpload.mockResolvedValue({ attachmentId: "a" });
    svc.confirm.mockResolvedValue({ id: "a" });
    svc.get.mockResolvedValue({ id: "a" });
    getSvc.mockReturnValue(svc);
    const attachmentId = randomUUID();
    await signedIn().createUploadUrl({ ...validUpload(), userId: randomUUID() } as any);
    await signedIn().confirm({ attachmentId, userId: randomUUID() } as any);
    await signedIn().get({ attachmentId, userId: randomUUID() } as any);
    expect(svc.createUpload.mock.calls[0]![0].userId).toBe(userId);
    expect(svc.confirm.mock.calls[0]![0]).toEqual({ userId, attachmentId });
    expect(svc.get.mock.calls[0]![0]).toEqual({ userId, attachmentId });
  });

  it("answers STORAGE_DISABLED when storage is not configured (e.g. on the Next.js side)", async () => {
    getSvc.mockReturnValue(null);
    for (const call of [
      () => signedIn().createUploadUrl(validUpload()),
      () => signedIn().confirm({ attachmentId: randomUUID() }),
      () => signedIn().get({ attachmentId: randomUUID() }),
    ]) await expect(call()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "STORAGE_DISABLED" });
  });
});

describe("error mapping (stable codes in the message)", () => {
  const expected: Record<StorageErrorCode, string> = {
    STORAGE_DISABLED: "SERVICE_UNAVAILABLE", INVALID_BUCKET: "BAD_REQUEST", INVALID_MIME: "UNSUPPORTED_MEDIA_TYPE",
    INVALID_SIZE: "BAD_REQUEST", FILE_TOO_LARGE: "PAYLOAD_TOO_LARGE", QUOTA_BYTES: "TOO_MANY_REQUESTS",
    QUOTA_DAILY: "TOO_MANY_REQUESTS", CONVERSATION_NOT_FOUND: "NOT_FOUND", OBJECT_NOT_FOUND: "NOT_FOUND", UPSTREAM: "BAD_GATEWAY",
  };
  it.each(Object.entries(expected))("StorageError %s -> %s", async (code, trpcCode) => {
    const svc = fakeSvc();
    svc.createUpload.mockRejectedValue(new StorageError(code as StorageErrorCode, "internal detail that must not leak"));
    getSvc.mockReturnValue(svc);
    await expect(signedIn().createUploadUrl(validUpload())).rejects.toMatchObject({ code: trpcCode, message: code });
  });

  it("AttachmentError codes", async () => {
    const svc = fakeSvc();
    getSvc.mockReturnValue(svc);
    svc.get.mockRejectedValue(new AttachmentError("NOT_FOUND"));
    await expect(signedIn().get({ attachmentId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
    svc.confirm.mockRejectedValue(new AttachmentError("QUEUE_UNAVAILABLE"));
    await expect(signedIn().confirm({ attachmentId: randomUUID() })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "QUEUE_UNAVAILABLE" });
  });

  it("an unexpected error stays an internal error (reported, detail not shaped into a code)", async () => {
    const svc = fakeSvc();
    svc.get.mockRejectedValue(new Error("db exploded"));
    getSvc.mockReturnValue(svc);
    const err = await signedIn().get({ attachmentId: randomUUID() }).catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
