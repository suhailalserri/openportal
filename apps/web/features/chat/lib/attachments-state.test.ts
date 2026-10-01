import { describe, it, expect } from "vitest";

import { attachReducer, isUploading, readyAttachments, remainingSlots, type AttachItem } from "./attachments-state";

const item = (localId: string, over: Partial<AttachItem> = {}): AttachItem => ({ localId, fileName: `${localId}.txt`, sizeBytes: 10, kind: "document", status: "uploading", stage: "uploading", ...over });
const run = (s: AttachItem[], ...a: Parameters<typeof attachReducer>[1][]) => a.reduce(attachReducer, s);

describe("attachReducer", () => {
  it("adds an uploading item once (a repeated id is ignored)", () => {
    const s = run([], { type: "ADD", item: item("a") }, { type: "ADD", item: item("a") });
    expect(s).toHaveLength(1);
  });
  it("moves through stages, then ready with the server id and the server's file name/size", () => {
    let s = run([], { type: "ADD", item: item("a") }, { type: "STAGE", localId: "a", stage: "reading" });
    expect(s[0]!.stage).toBe("reading");
    s = run(s, { type: "READY", localId: "a", attachmentId: "srv-1", fileName: "clean.txt", sizeBytes: 55, truncated: true });
    expect(s[0]).toMatchObject({ status: "ready", attachmentId: "srv-1", fileName: "clean.txt", sizeBytes: 55, truncated: true });
    expect(s[0]!.stage).toBeUndefined();
  });
  it("a failure keeps the item with its message key; a late READY/STAGE for a failed or removed item is ignored", () => {
    let s = run([], { type: "ADD", item: item("a") }, { type: "FAIL", localId: "a", errorKey: "attachErrNoText" });
    expect(s[0]).toMatchObject({ status: "error", errorKey: "attachErrNoText" });
    s = run(s, { type: "READY", localId: "a", attachmentId: "x", fileName: "f", sizeBytes: 1, truncated: false }, { type: "STAGE", localId: "a", stage: "reading" });
    expect(s[0]!.status).toBe("error");
    s = run(s, { type: "REMOVE", localId: "a" }, { type: "READY", localId: "a", attachmentId: "x", fileName: "f", sizeBytes: 1, truncated: false });
    expect(s).toEqual([]);
  });
  it("remove and clear", () => {
    expect(run([item("a"), item("b")], { type: "REMOVE", localId: "a" }).map((i) => i.localId)).toEqual(["b"]);
    expect(run([item("a")], { type: "CLEAR" })).toEqual([]);
  });
});

describe("selectors", () => {
  const ready = (id: string, att: string) => item(id, { status: "ready", attachmentId: att, stage: undefined, kind: "image" });
  it("only ready items with a server id are sent", () => {
    const items = [ready("a", "s1"), item("b"), item("c", { status: "error" }), item("d", { status: "ready", attachmentId: undefined })];
    expect(readyAttachments(items)).toEqual([{ id: "s1", fileName: "a.txt", kind: "image", sizeBytes: 10 }]);
  });
  it("isUploading is true while any item is still uploading", () => {
    expect(isUploading([ready("a", "s1")])).toBe(false);
    expect(isUploading([ready("a", "s1"), item("b")])).toBe(true);
  });
  it("five slots, errors do not count against them", () => {
    expect(remainingSlots([])).toBe(5);
    expect(remainingSlots([item("a"), item("b", { status: "error" }), ready("c", "s")])).toBe(3);
    expect(remainingSlots([1, 2, 3, 4, 5, 6].map((n) => item(String(n))))).toBe(0);
  });
});
