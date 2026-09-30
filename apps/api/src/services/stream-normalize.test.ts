/**
 * P6.2: one fixture per upstream shape, run through the real StreamV2Writer so the assertions are on
 * the events a client would see. Pure: no db, config or network.
 */
import { describe, it, expect } from "vitest";
import type { StreamEvent } from "@ai-platform/types";
import { StreamV2Writer } from "./stream-v2";
import { StreamNormalizer } from "./stream-normalize";

const USAGE = { inputTokens: 1, outputTokens: 1, creditCost: 0 };

function run(chunks: unknown[]) {
  const frames: string[] = [];
  const w = new StreamV2Writer((f) => { frames.push(f); }, { id: "req-1", model: "m1" });
  const n = new StreamNormalizer(w, "req-1");
  const emitted = chunks.map((c) => n.push(c));
  w.finish("end_turn", USAGE);
  const events = frames.map((f) => JSON.parse(f.split("\ndata: ")[1]!.trimEnd()) as StreamEvent);
  return { n, events, emitted, types: events.map((e) => e.type) };
}

const d = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ choices: [{ delta, ...extra }] });
const tc = (index: number, extra: Record<string, unknown>) => d({ tool_calls: [{ index, ...extra }] });

/** Reassembles the JSON arguments of every tool_use block, in block order. */
function toolInputs(events: StreamEvent[]) {
  const out: Array<{ id: string; name: string; json: string }> = [];
  const byIndex = new Map<number, (typeof out)[number]>();
  for (const e of events) {
    if (e.type === "content_block_start" && e.contentBlock.type === "tool_use") {
      const t = { id: e.contentBlock.id, name: e.contentBlock.name, json: "" };
      byIndex.set(e.index, t); out.push(t);
    }
    if (e.type === "content_block_delta" && e.delta.type === "input_json_delta") byIndex.get(e.index)!.json += e.delta.partialJson;
  }
  return out;
}

describe("StreamNormalizer", () => {
  it("plain OpenAI: role-only and empty chunks emit nothing, content becomes one text block", () => {
    const { events, emitted, n } = run([
      d({ role: "assistant", content: "" }), d({ content: "Hel" }), d({ content: "lo" }),
      d({}, { finish_reason: "stop" }), { usage: { prompt_tokens: 1 } },
    ]);
    expect(emitted).toEqual([false, true, true, false, false]);
    expect(events.map((e) => e.type)).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_delta",
      "content_block_stop", "message_delta", "message_stop"]);
    expect(n.text).toBe("Hello");
    expect(n.extraOutput).toBe("");
    expect(n.finishReason).toBe("stop");
  });

  it("reasoning_content becomes a thinking block and is counted as extra output, not as text", () => {
    const { events, n } = run([d({ reasoning_content: "Let me " }), d({ reasoning_content: "think." }), d({ content: "42" })]);
    expect(events.filter((e) => e.type === "content_block_start").map((e: any) => e.contentBlock.type)).toEqual(["thinking", "text"]);
    const thinking = events.filter((e: any) => e.delta?.type === "thinking_delta").map((e: any) => e.delta.thinking).join("");
    expect(thinking).toBe("Let me think.");
    expect(n.text).toBe("42");
    expect(n.extraOutput).toBe("Let me think.");
  });

  it("the OpenRouter `reasoning` alias works; reasoning_content wins when both are present", () => {
    const a = run([d({ reasoning: "alias" })]);
    expect(a.n.extraOutput).toBe("alias");
    expect(a.types).toContain("content_block_start");
    const b = run([d({ reasoning_content: "main", reasoning: "alias" })]);
    expect(b.n.extraOutput).toBe("main");
  });

  it("reasoning then text then reasoning: a block per switch, each closed before the next opens", () => {
    const { events } = run([d({ reasoning_content: "a" }), d({ content: "b" }), d({ reasoning_content: "c" })]);
    expect(events.map((e) => e.type)).toEqual(["message_start",
      "content_block_start", "content_block_delta", "content_block_stop",
      "content_block_start", "content_block_delta", "content_block_stop",
      "content_block_start", "content_block_delta", "content_block_stop",
      "message_delta", "message_stop"]);
  });

  it("a tool call with split arguments reassembles into valid JSON in one block", () => {
    const { events, n } = run([
      tc(0, { id: "call_1", type: "function", function: { name: "get_weather", arguments: "" } }),
      tc(0, { function: { arguments: '{"city":' } }),
      tc(0, { function: { arguments: '"Da' } }),
      tc(0, { function: { arguments: 'mascus"}' } }),
      d({}, { finish_reason: "tool_calls" }),
    ]);
    const tools = toolInputs(events);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ id: "call_1", name: "get_weather" });
    expect(JSON.parse(tools[0]!.json)).toEqual({ city: "Damascus" });
    expect(events.filter((e) => e.type === "content_block_start")).toHaveLength(1);
    expect(n.finishReason).toBe("tool_calls");
    expect(n.text).toBe("");
    expect(n.extraOutput).toBe('{"city":"Damascus"}');
  });

  it("parallel calls each get their own block, in order, with their own arguments", () => {
    const { events, n } = run([
      tc(0, { id: "call_a", function: { name: "f", arguments: '{"x":' } }),
      tc(0, { function: { arguments: "1}" } }),
      tc(1, { id: "call_b", function: { name: "g", arguments: '{"y":2}' } }),
    ]);
    const tools = toolInputs(events);
    expect(tools.map((t) => [t.id, t.name, JSON.parse(t.json)])).toEqual([["call_a", "f", { x: 1 }], ["call_b", "g", { y: 2 }]]);
    expect(n.droppedToolFragments).toBe(0);
    // never two blocks open at once
    let open = 0;
    for (const e of events) {
      if (e.type === "content_block_start") { open++; expect(open).toBe(1); }
      if (e.type === "content_block_stop") open--;
    }
  });

  it("several complete calls in ONE chunk (id on each, no index) become separate blocks", () => {
    const { events } = run([d({ tool_calls: [
      { id: "c1", function: { name: "f", arguments: "{}" } },
      { id: "c2", function: { name: "g", arguments: "{}" } },
    ] })]);
    expect(toolInputs(events).map((t) => [t.id, t.name])).toEqual([["c1", "f"], ["c2", "g"]]);
  });

  it("a provider that reuses index 0 for a second call announces it with a new id", () => {
    const { events } = run([
      tc(0, { id: "c1", function: { name: "f", arguments: "{}" } }),
      tc(0, { id: "c2", function: { name: "g", arguments: '{"a":1}' } }),
    ]);
    expect(toolInputs(events).map((t) => t.id)).toEqual(["c1", "c2"]);
  });

  it("no id from the provider: a stable id is made from the prefix and index", () => {
    const { events } = run([tc(0, { function: { name: "f", arguments: "{" } }), tc(0, { function: { arguments: "}" } })]);
    const tools = toolInputs(events);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ id: "req-1_call_0", json: "{}" });
  });

  it("arguments that arrive before the name are held and flushed when the block opens", () => {
    const { events, emitted } = run([tc(0, { id: "c1", function: { arguments: '{"a"' } }), tc(0, { function: { name: "f", arguments: ":1}" } })]);
    expect(emitted).toEqual([false, true]);
    expect(toolInputs(events)[0]).toMatchObject({ name: "f", json: '{"a":1}' });
  });

  it("text after a tool call closes it; a late fragment for the closed call is dropped, never written elsewhere", () => {
    const { events, n } = run([
      tc(0, { id: "c1", function: { name: "f", arguments: '{"a":' } }),
      d({ content: "oops" }),
      tc(0, { function: { arguments: "1}" } }),
    ]);
    expect(n.droppedToolFragments).toBe(1);
    expect(toolInputs(events)[0]!.json).toBe('{"a":');
    const text = events.filter((e: any) => e.delta?.type === "text_delta").map((e: any) => e.delta.text).join("");
    expect(text).toBe("oops");
  });

  it("reasoning, text and a tool call in one chunk come out in that order", () => {
    const { events } = run([d({ reasoning_content: "r", content: "t", tool_calls: [{ index: 0, id: "c", function: { name: "f", arguments: "{}" } }] })]);
    expect(events.filter((e) => e.type === "content_block_start").map((e: any) => e.contentBlock.type)).toEqual(["thinking", "text", "tool_use"]);
  });

  it("malformed shapes never throw and emit nothing", () => {
    const { emitted, types } = run([null, undefined, 5, "x", {}, { choices: [] }, { choices: [null] }, d({ tool_calls: "nope" }),
      d({ tool_calls: [null, 3, { function: 7 }] }), d({ content: 5 as unknown as string }), d({ reasoning_content: { a: 1 } })]);
    expect(emitted.every((x) => x === false)).toBe(true);
    expect(types).toEqual(["message_start", "message_delta", "message_stop"]);
  });
});
