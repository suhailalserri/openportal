import { describe, it, expect } from "vitest";

import type { ChatMessage } from "../types";
import { toWireMessages } from "./wire-messages";

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "content">): ChatMessage {
  return { createdAt: "2026-10-01T00:00:00.000Z", isPartial: false, ...over };
}

describe("toWireMessages", () => {
  it("sends role and content only: the model never gets its own reasoning back", () => {
    const out = toWireMessages([
      msg({ id: "1", role: "user", content: "hi" }),
      msg({
        id: "2",
        role: "assistant",
        content: "hello",
        thinking: { text: "SECRET REASONING", startedAt: 1, endedAt: 2 },
        modelId: "m",
        inputTokens: 1,
        outputTokens: 2,
        creditCost: 3,
        isPartial: true,
      }),
    ]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(JSON.stringify(out)).not.toContain("SECRET REASONING");
    for (const m of out) expect(Object.keys(m).sort()).toEqual(["content", "role"]);
  });

  it("leaves out an assistant turn that has reasoning but no answer text (a provider may reject an empty one)", () => {
    const out = toWireMessages([
      msg({ id: "1", role: "user", content: "q" }),
      msg({ id: "2", role: "assistant", content: "", thinking: { text: "only thoughts", startedAt: 1 } }),
      msg({ id: "3", role: "assistant", content: "  \n ", isPartial: true }),
      msg({ id: "4", role: "user", content: "q2" }),
    ]);
    expect(out).toEqual([
      { role: "user", content: "q" },
      { role: "user", content: "q2" },
    ]);
  });

  it("never drops a user turn, even an empty one, and keeps every assistant turn that has text", () => {
    expect(
      toWireMessages([
        msg({ id: "1", role: "user", content: "" }),
        msg({ id: "2", role: "assistant", content: "a" }),
      ]),
    ).toEqual([
      { role: "user", content: "" },
      { role: "assistant", content: "a" },
    ]);
  });

  it("drops a system row instead of casting it through", () => {
    expect(
      toWireMessages([
        msg({ id: "0", role: "system", content: "x" }),
        msg({ id: "1", role: "user", content: "hi" }),
      ]),
    ).toEqual([{ role: "user", content: "hi" }]);
  });
});
