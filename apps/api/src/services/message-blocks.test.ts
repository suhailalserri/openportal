import { describe, it, expect } from "vitest";
import { BlockRecorder, flattenTextBlocks, MAX_THINKING_CHARS } from "./message-blocks";
import { StreamNormalizer, type NormalizeSink } from "./stream-normalize";
import { StreamV2Writer } from "./stream-v2";

/** A sink that remembers every call, to prove the recorder forwards unchanged. */
function recorderSink(acceptArgs = true) {
  const calls: Array<[string, ...unknown[]]> = [];
  const sink: NormalizeSink = {
    text: (t) => { calls.push(["text", t]); },
    thinking: (t) => { calls.push(["thinking", t]); },
    toolStart: (id, name) => { calls.push(["toolStart", id, name]); },
    toolArgs: (id, json) => { calls.push(["toolArgs", id, json]); return acceptArgs; },
  };
  return { sink, calls };
}

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("BlockRecorder", () => {
  it("returns null when nothing was recorded", () => {
    const { sink } = recorderSink();
    expect(new BlockRecorder(sink).result()).toBeNull();
  });

  it("a text-only reply is one text block, chunks joined", () => {
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink);
    r.text("Hel"); r.text("lo");
    expect(r.result()).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("thinking then text: two blocks in order, thinking carries its duration", () => {
    const c = clock();
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink, c.now);
    r.thinking("Let me "); c.advance(1_200); r.thinking("think.");
    c.advance(300); r.text("42");
    expect(r.result()).toEqual([
      { type: "thinking", thinking: "Let me think.", durationMs: 1_500 },
      { type: "text", text: "42" },
    ]);
  });

  it("a reasoning-only reply keeps the thinking block and closes it at result()", () => {
    const c = clock();
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink, c.now);
    r.thinking("still thinking"); c.advance(2_000);
    expect(r.result()).toEqual([{ type: "thinking", thinking: "still thinking", durationMs: 2_000 }]);
  });

  it("keeps the order text, tool_use, text and does not merge text across a tool call", () => {
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink);
    r.text("Checking. ");
    r.toolStart("call_1", "get_weather");
    r.toolArgs("call_1", '{"city":"Da'); r.toolArgs("call_1", 'mascus"}');
    r.text("Done.");
    expect(r.result()).toEqual([
      { type: "text", text: "Checking. " },
      { type: "tool_use", id: "call_1", name: "get_weather", input: { city: "Damascus" } },
      { type: "text", text: "Done." },
    ]);
  });

  it("tool arguments: none -> {}, cut mid-JSON -> input null + inputRaw", () => {
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink);
    r.toolStart("a", "no_args");
    r.toolStart("b", "cut");
    r.toolArgs("b", '{"q":"unfini');
    expect(r.result()).toEqual([
      { type: "tool_use", id: "a", name: "no_args", input: {} },
      { type: "tool_use", id: "b", name: "cut", input: null, inputRaw: '{"q":"unfini' },
    ]);
  });

  it("a fragment the writer refuses is not recorded and the refusal is passed back", () => {
    const { sink } = recorderSink(false);
    const r = new BlockRecorder(sink);
    r.toolStart("a", "t");
    expect(r.toolArgs("a", '{"x":1}')).toBe(false);
    expect(r.result()).toEqual([{ type: "tool_use", id: "a", name: "t", input: {} }]);
  });

  it("a fragment for a call that is no longer the open block is not recorded", () => {
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink);
    r.toolStart("a", "first");
    r.toolStart("b", "second");
    r.toolArgs("a", '{"late":true}');
    expect(r.result()).toEqual([
      { type: "tool_use", id: "a", name: "first", input: {} },
      { type: "tool_use", id: "b", name: "second", input: {} },
    ]);
  });

  it("forwards every call to the sink unchanged and in order, empty strings included", () => {
    const { sink, calls } = recorderSink();
    const r = new BlockRecorder(sink);
    r.thinking("t"); r.text(""); r.text("x"); r.toolStart("i", "n"); r.toolArgs("i", "{}");
    expect(calls).toEqual([
      ["thinking", "t"], ["text", ""], ["text", "x"], ["toolStart", "i", "n"], ["toolArgs", "i", "{}"],
    ]);
  });

  it("caps one thinking block at MAX_THINKING_CHARS and says so; text is never cut", () => {
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink);
    r.thinking("a".repeat(MAX_THINKING_CHARS - 2));
    r.thinking("bbbbbb");
    r.thinking("more");
    const long = "z".repeat(MAX_THINKING_CHARS + 50);
    r.text(long);
    const blocks = r.result()!;
    const thinking = blocks[0]!;
    expect(thinking.type).toBe("thinking");
    if (thinking.type === "thinking") {
      expect(thinking.thinking).toHaveLength(MAX_THINKING_CHARS);
      expect(thinking.truncated).toBe(true);
    }
    expect(flattenTextBlocks(blocks)).toBe(long);
  });

  it("never cuts a surrogate pair in half at the cap", () => {
    const { sink } = recorderSink();
    const r = new BlockRecorder(sink);
    r.thinking("a".repeat(MAX_THINKING_CHARS - 1));
    r.thinking("😀");                       // two UTF-16 units; only one fits
    const b = r.result()![0]!;
    if (b.type !== "thinking") throw new Error("expected thinking");
    expect(b.thinking).toHaveLength(MAX_THINKING_CHARS - 1);
    expect(b.truncated).toBe(true);
  });

  it("result() is idempotent and later input is forwarded but not recorded", () => {
    const { sink, calls } = recorderSink();
    const r = new BlockRecorder(sink);
    r.text("a");
    const first = r.result();
    r.text("late");
    expect(r.result()).toEqual(first);
    expect(calls).toEqual([["text", "a"], ["text", "late"]]);
  });
});

describe("BlockRecorder behind the real normalizer and writer", () => {
  const delta = (d: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ choices: [{ delta: d, ...extra }] });

  it("thinking + tool_use + text round-trip through JSON; flat content equals the text blocks", () => {
    const frames: string[] = [];
    const writer = new StreamV2Writer((f) => { frames.push(f); }, { id: "req_1", model: "m" });
    const recorder = new BlockRecorder(writer);
    const normalizer = new StreamNormalizer(recorder, "req_1");
    for (const chunk of [
      delta({ reasoning_content: "Need the weather. " }),
      delta({ content: "One moment. " }),
      delta({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_weather", arguments: "" } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '{"city":"Da' } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: 'mascus"}' } }] }, { finish_reason: "tool_calls" }),
    ]) normalizer.push(chunk);

    const blocks = recorder.result()!;
    expect(blocks.map((b) => b.type)).toEqual(["thinking", "text", "tool_use"]);
    expect(blocks[2]).toEqual({ type: "tool_use", id: "call_1", name: "get_weather", input: { city: "Damascus" } });
    expect(flattenTextBlocks(blocks)).toBe(normalizer.text);
    // what the database does: JSON in, JSON out
    expect(JSON.parse(JSON.stringify(blocks))).toEqual(blocks);
    // the recorder did not change what went on the wire
    expect(frames.some((f) => f.startsWith("event: content_block_start"))).toBe(true);
  });

  it("an interrupted reasoning-only reply: empty content, one thinking block", () => {
    const writer = new StreamV2Writer(() => {}, { id: "r", model: "m" });
    const recorder = new BlockRecorder(writer);
    const normalizer = new StreamNormalizer(recorder, "r");
    normalizer.push(delta({ reasoning: "thinking out loud" }));
    const blocks = recorder.result()!;
    expect(flattenTextBlocks(blocks)).toBe("");
    expect(normalizer.text).toBe("");
    expect(blocks).toHaveLength(1);
  });
});
