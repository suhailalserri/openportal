import { describe, it, expect } from "vitest";

import { createStreamV2Parser, interpretFrame, type StreamV2Event } from "./stream-v2-parser";

/**
 * P6.3a. The parser is pure, so every case feeds it strings directly. Frames
 * are built the way the api writes them (services/stream-v2.ts formatStreamEvent):
 * `event: <type>\ndata: <json>\n\n`.
 */

function frame(type: string, body: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
}
const textDelta = (text: string) =>
  frame("content_block_delta", { index: 1, delta: { type: "text_delta", text } });
const thinkingDelta = (thinking: string) =>
  frame("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking } });

function feedAll(parser: ReturnType<typeof createStreamV2Parser>, chunks: string[]): StreamV2Event[] {
  return chunks.flatMap((c) => parser.push(c));
}

describe("createStreamV2Parser — a normal stream", () => {
  it("maps the events the UI needs and ignores block bookkeeping", () => {
    const wire =
      frame("message_start", { message: { id: "r1", model: "m", role: "assistant" } }) +
      frame("content_block_start", { index: 0, contentBlock: { type: "thinking" } }) +
      thinkingDelta("hmm") +
      frame("content_block_stop", { index: 0 }) +
      frame("content_block_start", { index: 1, contentBlock: { type: "text" } }) +
      textDelta("Hi") +
      frame("content_block_stop", { index: 1 }) +
      frame("message_delta", {
        delta: { stopReason: "end_turn" },
        usage: { inputTokens: 1, outputTokens: 2, creditCost: 3 },
      }) +
      frame("message_stop", {});
    expect(createStreamV2Parser().push(wire)).toEqual([
      { type: "thinking", text: "hmm" },
      { type: "text", text: "Hi" },
      { type: "stop", stopReason: "end_turn" },
      { type: "end" },
    ]);
  });

  it("reports the status code and error fields as sent", () => {
    const p = createStreamV2Parser();
    expect(p.push(frame("status", { code: "waiting" }))).toEqual([{ type: "status", code: "waiting" }]);
    expect(p.push(frame("error", { code: "STREAM_INTERRUPTED", message: "cut" }))).toEqual([
      { type: "error", code: "STREAM_INTERRUPTED", message: "cut" },
    ]);
  });

  it("reads the interrupted and tool_use stop reasons, and maps anything else to unknown", () => {
    const p = createStreamV2Parser();
    const stop = (r: unknown) => p.push(frame("message_delta", { delta: { stopReason: r }, usage: {} }));
    expect(stop("interrupted")).toEqual([{ type: "stop", stopReason: "interrupted" }]);
    expect(stop("tool_use")).toEqual([{ type: "stop", stopReason: "tool_use" }]);
    expect(stop("something_new")).toEqual([{ type: "stop", stopReason: "unknown" }]);
  });
});

describe("createStreamV2Parser — frames split across chunks", () => {
  it("rebuilds a frame cut in the middle of a line, at every possible split point", () => {
    const wire = textDelta("hello world") + frame("message_stop", {});
    const expected = [
      { type: "text", text: "hello world" },
      { type: "end" },
    ];
    for (let i = 1; i < wire.length; i++) {
      const events = feedAll(createStreamV2Parser(), [wire.slice(0, i), wire.slice(i)]);
      expect(events).toEqual(expected);
    }
  });

  it("works one character at a time", () => {
    const wire = thinkingDelta("a") + textDelta("b") + frame("message_stop", {});
    const events = feedAll(createStreamV2Parser(), wire.split(""));
    expect(events).toEqual([
      { type: "thinking", text: "a" },
      { type: "text", text: "b" },
      { type: "end" },
    ]);
  });

  it("holds a frame back until its blank line arrives", () => {
    const p = createStreamV2Parser();
    const f = textDelta("x");
    expect(p.push(f.slice(0, -1))).toEqual([]); // everything but the last \n
    expect(p.push("\n")).toEqual([{ type: "text", text: "x" }]);
  });
});

describe("createStreamV2Parser — line endings and SSE rules", () => {
  it("accepts CRLF, and a CR at the end of one chunk whose LF starts the next", () => {
    const wire = textDelta("crlf").replace(/\n/g, "\r\n");
    expect(createStreamV2Parser().push(wire)).toEqual([{ type: "text", text: "crlf" }]);
    // every split, including between \r and \n
    for (let i = 1; i < wire.length; i++) {
      expect(feedAll(createStreamV2Parser(), [wire.slice(0, i), wire.slice(i)])).toEqual([
        { type: "text", text: "crlf" },
      ]);
    }
  });

  it("does not cut a frame in two when CRLF is split between the event: line and the data: line", () => {
    // The event name lives ONLY in the event: line here (the body has no `type`),
    // so a CR|LF split that ended the frame early would lose it.
    const wire = "event: message_stop\r\ndata: {}\r\n\r\n";
    for (let i = 1; i < wire.length; i++) {
      expect(feedAll(createStreamV2Parser(), [wire.slice(0, i), wire.slice(i)])).toEqual([{ type: "end" }]);
    }
  });

  it("accepts lone CR line endings, completing the last frame when the stream ends", () => {
    const wire = textDelta("cr").replace(/\n/g, "\r");
    const p = createStreamV2Parser();
    // the final CR might be half of a CRLF, so it is held until more data or the end
    expect([...p.push(wire), ...p.finish()]).toEqual([{ type: "text", text: "cr" }]);
  });

  it("finish() does nothing when there is nothing pending, and still drops an unfinished frame", () => {
    const p = createStreamV2Parser();
    expect(p.finish()).toEqual([]);
    expect(p.push("event: message_stop\ndata: {\"type\":\"message_stop\"}\n")).toEqual([]);
    expect(p.finish()).toEqual([]);
  });

  it("ignores comment lines and keeps working", () => {
    const wire = `: keep-alive\n\n${textDelta("ok")}`;
    expect(createStreamV2Parser().push(wire)).toEqual([{ type: "text", text: "ok" }]);
  });

  it("joins several data lines of one frame with a newline (SSE rule)", () => {
    // {"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}} split over two data lines
    const json = JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "a" } });
    const cut = json.indexOf(",");
    const wire = `event: content_block_delta\ndata: ${json.slice(0, cut)}\ndata: ${json.slice(cut)}\n\n`;
    // JSON.parse tolerates the newline between tokens, so the joined frame is valid
    expect(createStreamV2Parser().push(wire)).toEqual([{ type: "text", text: "a" }]);
  });

  it("falls back to the data's own `type` when there is no event: line", () => {
    const wire = `data: ${JSON.stringify({ type: "message_stop" })}\n\n`;
    expect(createStreamV2Parser().push(wire)).toEqual([{ type: "end" }]);
  });

  it("drops an unfinished frame at the end of the stream instead of guessing", () => {
    const p = createStreamV2Parser();
    expect(p.push("event: message_stop\ndata: {\"type\":\"message_stop\"}")).toEqual([]);
  });
});

describe("createStreamV2Parser — things it must ignore", () => {
  it("ignores unknown events and unknown delta kinds", () => {
    const wire =
      frame("future_event", { anything: 1 }) +
      frame("content_block_delta", { index: 2, delta: { type: "input_json_delta", partialJson: "{}" } }) +
      frame("content_block_start", { index: 2, contentBlock: { type: "tool_use", id: "t", name: "n" } }) +
      frame("content_block_delta", { index: 0, delta: { type: "brand_new_delta", x: 1 } }) +
      textDelta("still works");
    expect(createStreamV2Parser().push(wire)).toEqual([{ type: "text", text: "still works" }]);
  });

  it("skips a frame whose JSON is broken, without throwing or losing the next frame", () => {
    const wire = "event: content_block_delta\ndata: {not json\n\n" + textDelta("next");
    expect(createStreamV2Parser().push(wire)).toEqual([{ type: "text", text: "next" }]);
  });

  it("skips empty deltas", () => {
    expect(createStreamV2Parser().push(textDelta("") + thinkingDelta(""))).toEqual([]);
  });

  it("interpretFrame returns null for empty or non-object data", () => {
    expect(interpretFrame("message_stop", "")).toBeNull();
    expect(interpretFrame("message_stop", "42")).toBeNull();
    expect(interpretFrame("message_stop", "null")).toBeNull();
  });
});

describe("createStreamV2Parser — Arabic text", () => {
  it("keeps Arabic intact when the bytes are decoded with a streaming TextDecoder and split mid-character", () => {
    // The parser takes text, so the multi-byte split is the decoder's job; this
    // pins the pairing the reader relies on (one decoder, { stream: true }).
    const wire = textDelta("مرحبا بك") + thinkingDelta("نفكّر") + frame("message_stop", {});
    const bytes = new TextEncoder().encode(wire);
    for (let i = 1; i < bytes.length; i++) {
      const decoder = new TextDecoder();
      const parser = createStreamV2Parser();
      const events = [
        ...parser.push(decoder.decode(bytes.slice(0, i), { stream: true })),
        ...parser.push(decoder.decode(bytes.slice(i), { stream: true })),
        ...parser.push(decoder.decode()),
      ];
      expect(events).toEqual([
        { type: "text", text: "مرحبا بك" },
        { type: "thinking", text: "نفكّر" },
        { type: "end" },
      ]);
    }
  });
});
