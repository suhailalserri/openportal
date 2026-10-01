import { describe, expect, it } from "vitest";

import { setPendingFirstMessage, takePendingFirstMessage, takePendingFirstSend, hasPendingFirstMessage } from "./pending-first-message";

describe("pending-first-message", () => {
  it("returns undefined when nothing was stashed for this id", () => {
    expect(takePendingFirstMessage("no-such-id")).toBeUndefined();
  });

  it("returns the stashed content once, then undefined on a second take", () => {
    setPendingFirstMessage("c1", "hello there");
    expect(takePendingFirstMessage("c1")).toBe("hello there");
    expect(takePendingFirstMessage("c1")).toBeUndefined();
  });

  it("keeps separate ids independent", () => {
    setPendingFirstMessage("c1", "first");
    setPendingFirstMessage("c2", "second");
    expect(takePendingFirstMessage("c1")).toBe("first");
    expect(takePendingFirstMessage("c2")).toBe("second");
  });

  it("a later set for the same id overwrites the earlier one", () => {
    setPendingFirstMessage("c1", "draft one");
    setPendingFirstMessage("c1", "draft two");
    expect(takePendingFirstMessage("c1")).toBe("draft two");
  });
});


describe("P6.3c: the handoff also carries attachments", () => {
  const chip = { id: "att-1", fileName: "a.pdf", kind: "document" as const, sizeBytes: 5 };
  it("takePendingFirstSend returns text and attachments, exactly once", () => {
    setPendingFirstMessage("conv-att", "look at this", [chip]);
    expect(takePendingFirstSend("conv-att")).toEqual({ text: "look at this", attachments: [chip] });
    expect(takePendingFirstSend("conv-att")).toBeUndefined();
  });
  it("without attachments the entry has none, and the old string API is unchanged", () => {
    setPendingFirstMessage("conv-plain", "hello");
    expect(takePendingFirstSend("conv-plain")).toEqual({ text: "hello" });
    setPendingFirstMessage("conv-old", "hi", []);
    expect(takePendingFirstMessage("conv-old")).toBe("hi");
    expect(takePendingFirstMessage("conv-old")).toBeUndefined();
  });
  it("takePendingFirstMessage on an entry with attachments still returns just the text and consumes it", () => {
    setPendingFirstMessage("conv-mix", "text", [chip]);
    expect(hasPendingFirstMessage("conv-mix")).toBe(true);
    expect(takePendingFirstMessage("conv-mix")).toBe("text");
    expect(hasPendingFirstMessage("conv-mix")).toBe(false);
  });
});
