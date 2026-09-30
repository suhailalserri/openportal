/**
 * P6.1: the v2 emitter and Accept negotiation. Pure: no db, config or network.
 */
import { describe, it, expect } from "vitest";
import type { StreamEvent } from "@ai-platform/types";
import { StreamV2Writer, formatStreamEvent, negotiateStreamVersion, STREAM_V2_MEDIA_TYPE } from "./stream-v2";

const USAGE = { inputTokens: 12, outputTokens: 34, creditCost: 5_000 };

function harness(throwOnWrite = false) {
  const frames: string[] = [];
  const w = new StreamV2Writer((f) => { if (throwOnWrite) throw new Error("socket closed"); frames.push(f); }, { id: "req-1", model: "m1" });
  const events = (): StreamEvent[] => frames.map((f) => JSON.parse(f.split("\ndata: ")[1]!.trimEnd()) as StreamEvent);
  const types = () => events().map((e) => e.type);
  return { w, frames, events, types };
}

describe("negotiateStreamVersion", () => {
  it("v2 only when the exact media type is listed", () => {
    expect(negotiateStreamVersion(STREAM_V2_MEDIA_TYPE)).toBe("v2");
    expect(negotiateStreamVersion("text/plain, application/vnd.aip.stream+v2;q=0.8")).toBe("v2");
    expect(negotiateStreamVersion("Application/VND.AIP.Stream+V2")).toBe("v2");
    expect(negotiateStreamVersion(["text/plain", STREAM_V2_MEDIA_TYPE])).toBe("v2");
  });
  it("everything else stays v1", () => {
    for (const a of [undefined, null, "", "*/*", "text/*", "text/event-stream", "application/json",
      "application/vnd.aip.stream+v3", "application/vnd.aip.stream+v2;q=0", "application/vnd.aip.stream"]) {
      expect(negotiateStreamVersion(a)).toBe("v1");
    }
  });
});

describe("frame format", () => {
  it("is `event:` + one `data:` JSON line + blank line; newlines in text are JSON-escaped", () => {
    const f = formatStreamEvent({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "a\nb" } });
    expect(f).toBe('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a\\nb"}}\n\n');
    expect(f.split("\n\n")).toHaveLength(2);
  });
});

describe("StreamV2Writer block boundaries", () => {
  it("text stream: start, one block with deltas, stop, delta+usage, message_stop", () => {
    const { w, types, events } = harness();
    w.start(); w.text("Hel"); w.text("lo"); w.finish("end_turn", USAGE);
    expect(types()).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_delta",
      "content_block_stop", "message_delta", "message_stop"]);
    expect(events()[0]).toEqual({ type: "message_start", message: { id: "req-1", model: "m1", role: "assistant" } });
    expect(events()[1]).toEqual({ type: "content_block_start", index: 0, contentBlock: { type: "text" } });
    expect(events()[5]).toEqual({ type: "message_delta", delta: { stopReason: "end_turn" }, usage: USAGE });
  });
  it("message_start is implicit before the first content and sent exactly once", () => {
    const { w, types } = harness();
    w.text("x"); w.start(); w.start(); w.text("y"); w.finish("end_turn", USAGE);
    expect(types().filter((t) => t === "message_start")).toHaveLength(1);
    expect(types()[0]).toBe("message_start");
  });
  it("empty deltas write nothing and never open a block", () => {
    const { w, types } = harness();
    w.start(); w.text(""); w.finish("end_turn", USAGE);
    expect(types()).toEqual(["message_start", "message_delta", "message_stop"]);
  });
  it("switching block kind closes the open block first, indexes increase, at most one open at a time", () => {
    const { w, events } = harness();
    w.delta({ type: "thinking" }, { type: "thinking_delta", thinking: "hm" });
    w.text("answer");
    w.delta({ type: "tool_use", id: "t1", name: "search" }, { type: "input_json_delta", partialJson: '{"q":' });
    w.delta({ type: "tool_use", id: "t1", name: "search" }, { type: "input_json_delta", partialJson: '"x"}' });
    w.finish("end_turn", USAGE);
    let open = 0, maxOpen = 0;
    const order: string[] = [];
    for (const e of events()) {
      if (e.type === "content_block_start") { open++; order.push(`start${e.index}:${e.contentBlock.type}`); }
      if (e.type === "content_block_stop") { open--; order.push(`stop${e.index}`); }
      maxOpen = Math.max(maxOpen, open);
    }
    expect(maxOpen).toBe(1);
    expect(open).toBe(0);
    // same-id tool_use deltas: a new tool_use block is opened per delta() call with a tool_use start
    expect(order.slice(0, 5)).toEqual(["start0:thinking", "stop0", "start1:text", "stop1", "start2:tool_use"]);
  });
  it("finish closes an open block, and the stream ends with message_stop exactly once", () => {
    const { w, types } = harness();
    w.text("partial");
    w.finish("interrupted", USAGE);
    w.finish("end_turn", USAGE); // ignored
    w.text("late");              // ignored
    w.error("X", "late");        // ignored
    const t = types();
    expect(t.slice(-3)).toEqual(["content_block_stop", "message_delta", "message_stop"]);
    expect(t.filter((x) => x === "message_stop")).toHaveLength(1);
    expect(t.filter((x) => x === "message_delta")).toHaveLength(1);
    expect(t[t.length - 1]).toBe("message_stop");
  });
  it("an error event closes the open block and does not end the stream", () => {
    const { w, events, types } = harness();
    w.text("part"); w.error("STREAM_INTERRUPTED", "msg"); w.finish("interrupted", USAGE);
    expect(types()).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_stop",
      "error", "message_delta", "message_stop"]);
    expect(events()[4]).toEqual({ type: "error", code: "STREAM_INTERRUPTED", message: "msg" });
  });
  it("a write that throws (client gone) never throws out of the writer", () => {
    const { w } = harness(true);
    expect(() => { w.start(); w.text("x"); w.error("E", "m"); w.finish("interrupted", USAGE); }).not.toThrow();
  });
});

describe("StreamV2Writer (P6.2 additions)", () => {
  it("thinking() opens a thinking block and appends to it; text closes it", () => {
    const { w, events } = harness();
    w.thinking("a"); w.thinking("b"); w.text("c"); w.finish("end_turn", USAGE);
    expect(events().map((e) => e.type)).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_delta",
      "content_block_stop", "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"]);
  });

  it("toolStart/toolArgs: fragments go to the open tool block only; an empty fragment is fine", () => {
    const { w, events } = harness();
    w.toolStart("t1", "f");
    expect(w.toolArgs("t1", "{")).toBe(true);
    expect(w.toolArgs("t1", "")).toBe(true);
    expect(w.toolArgs("other", "x")).toBe(false);
    w.toolStart("t2", "g");
    expect(w.toolArgs("t1", "}")).toBe(false);   // t1 is closed now
    w.finish("end_turn", USAGE);
    const deltas = events().filter((e) => e.type === "content_block_delta");
    expect(deltas).toHaveLength(1);
    expect(events().filter((e) => e.type === "content_block_start")).toHaveLength(2);
  });

  it("toolArgs with no open block writes nothing; nothing is written after finish()", () => {
    const { w, frames } = harness();
    expect(w.toolArgs("t1", "{")).toBe(false);
    expect(frames).toHaveLength(0);
    w.finish("tool_use", USAGE);
    const n = frames.length;
    w.thinking("x"); w.toolStart("t", "f"); w.status("waiting");
    expect(frames).toHaveLength(n);
  });

  it("status() is sent once before any block, never after one, and finish() still ends the stream", () => {
    const a = harness();
    a.w.status("waiting"); a.w.text("hi"); a.w.status("waiting"); a.w.finish("end_turn", USAGE);
    expect(a.types()).toEqual(["message_start", "status", "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"]);
    expect(a.events()[1]).toEqual({ type: "status", code: "waiting" });
    const b = harness();
    b.w.status("waiting"); b.w.finish("end_turn", USAGE);
    expect(b.types()).toEqual(["message_start", "status", "message_delta", "message_stop"]);
  });

  it("message_delta can carry stopReason tool_use", () => {
    const { w, events } = harness();
    w.finish("tool_use", USAGE);
    expect(events()[1]).toMatchObject({ type: "message_delta", delta: { stopReason: "tool_use" } });
  });
});

