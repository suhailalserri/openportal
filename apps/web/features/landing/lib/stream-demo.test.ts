import { describe, it, expect } from "vitest";

import { balanceMarkdown, chunkForStream, delayAfter } from "./stream-demo";

describe("chunkForStream", () => {
  it("round-trips: joined chunks equal the input exactly", () => {
    const text = "Sure — a few:\n\n- **Data fetching**: REST\n- x";
    expect(chunkForStream(text).join("")).toBe(text);
  });
  it("keeps Arabic words whole (never splits inside a word)", () => {
    const text = "بالتأكيد — من أبرز الفروقات:";
    const chunks = chunkForStream(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.map((c) => c.trim()).filter(Boolean)).toEqual(text.split(/\s+/));
  });
  it("returns [] for empty input", () => {
    expect(chunkForStream("")).toEqual([]);
  });
});

describe("balanceMarkdown", () => {
  it("closes an open bold so no raw ** flashes", () => {
    expect(balanceMarkdown("- **Data fet")).toBe("- **Data fet**");
  });
  it("leaves already-balanced markdown alone", () => {
    expect(balanceMarkdown("- **Data**: REST")).toBe("- **Data**: REST");
  });
  it("drops a lone trailing * (first half of an incoming **)", () => {
    expect(balanceMarkdown("- *")).toBe("- ");
    expect(balanceMarkdown("text *")).toBe("text ");
  });
  it("closes an open inline-code tick", () => {
    expect(balanceMarkdown("use `fetch")).toBe("use `fetch`");
  });
  it("the full text is unchanged once complete", () => {
    const full = "a **b** and `c`";
    expect(balanceMarkdown(full)).toBe(full);
  });
});

describe("delayAfter", () => {
  it("pauses longer after punctuation and newlines than mid-sentence", () => {
    expect(delayAfter("word ")).toBe(34);
    expect(delayAfter("end. ")).toBeGreaterThan(34);
    expect(delayAfter("line\n")).toBeGreaterThan(delayAfter("end. "));
  });
});
