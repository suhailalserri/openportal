import { describe, expect, it } from "vitest";

import { setPendingFirstMessage, takePendingFirstMessage } from "./pending-first-message";

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
