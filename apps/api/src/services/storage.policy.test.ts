import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { BUCKETS, buildObjectKey, normalizeMime, parseObjectKey, validateUpload } from "./storage.policy";

describe("validateUpload", () => {
  const ok = { bucket: "attachments", mimeType: "application/pdf", sizeBytes: 1000 };
  it("accepts an allowed type and size", () => {
    expect(validateUpload(ok)).toMatchObject({ ok: true, mime: "application/pdf" });
  });
  it("rejects oversized files", () => {
    expect(validateUpload({ ...ok, sizeBytes: BUCKETS.attachments.maxBytes + 1 })).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
    expect(validateUpload({ bucket: "audio", mimeType: "audio/webm", sizeBytes: BUCKETS.audio.maxBytes + 1 })).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  });
  it.each(["application/zip", "application/x-msdownload", "image/svg+xml", "text/html", "application/x-sh", "audio/webm"])(
    "rejects %s in attachments", (mimeType) => {
      expect(validateUpload({ ...ok, mimeType })).toEqual({ ok: false, code: "INVALID_MIME" });
    });
  it("rejects a non-audio type in the audio bucket", () => {
    expect(validateUpload({ bucket: "audio", mimeType: "application/pdf", sizeBytes: 10 })).toEqual({ ok: false, code: "INVALID_MIME" });
  });
  it("normalizes MediaRecorder parameters and case", () => {
    expect(normalizeMime("Audio/WebM; codecs=opus")).toBe("audio/webm");
    expect(validateUpload({ bucket: "audio", mimeType: "audio/webm;codecs=opus", sizeBytes: 10 }).ok).toBe(true);
  });
  it.each([0, -5, 1.5, NaN])("rejects size %s", (sizeBytes) => {
    expect(validateUpload({ ...ok, sizeBytes })).toEqual({ ok: false, code: "INVALID_SIZE" });
  });
  it("rejects an unknown bucket", () => {
    expect(validateUpload({ ...ok, bucket: "public" })).toEqual({ ok: false, code: "INVALID_BUCKET" });
  });
});

describe("object keys", () => {
  it("round-trips {userId}/{conversationId}/{uuid}", () => {
    const [u, c, o] = [randomUUID(), randomUUID(), randomUUID()];
    const key = buildObjectKey(u, c, o);
    expect(key).toBe(`${u}/${c}/${o}`);
    expect(parseObjectKey(key)).toEqual({ userId: u, conversationId: c, objectId: o });
  });
  it("rejects traversal and wrong shapes", () => {
    const u = randomUUID();
    expect(parseObjectKey(`${u}/../${u}`)).toBeNull();
    expect(parseObjectKey(`${u}/${u}`)).toBeNull();
    expect(parseObjectKey(`${u}/${u}/${u}/x`)).toBeNull();
    expect(parseObjectKey("a/b/c")).toBeNull();
  });
});
