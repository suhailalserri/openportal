/**
 * apps/web/features/chat/lib/stream-v2-parser.ts
 *
 * P6.3a. Pure, incremental parser for the structured chat stream (protocol
 * v2, docs/frontend/API_CONTRACT.md section 3). No fetch, no React, no
 * timers: feed it decoded text, get back the events it could complete.
 *
 * INPUT IS TEXT, NOT BYTES. The caller (stream-reader.ts) owns one
 * `TextDecoder` and decodes with `{ stream: true }`, which is what keeps a
 * UTF-8 character (every Arabic letter is 2 bytes) that lands split across
 * two network reads intact. This parser then only has to cope with a FRAME
 * split across chunks: a line cut in half, a blank line in the next chunk,
 * a CR at the end of one chunk and its LF at the start of the next.
 *
 * WIRE FORMAT (packages/types/src/stream.types.ts, type-only there, so the
 * few shapes this client needs are declared here instead of imported):
 *   event: <type>\n data: <json>\n \n      (Server-Sent Events)
 * Line endings may be \n, \r\n or \r. `:` lines are comments. Several `data:`
 * lines in one frame are joined with \n (SSE rule), although this server
 * only ever sends one.
 *
 * WHAT IS KEPT: text and thinking deltas, `status`, `error`, the stop reason
 * from `message_delta`, and `message_stop`. WHAT IS IGNORED ON PURPOSE:
 * block start/stop (a delta carries its own kind and a block never changes
 * kind), `tool_use` blocks and `input_json_delta` (tool chips come later),
 * usage numbers (the message's token/credit fields stay empty for now), and
 * any event type this client does not know, so a newer server never breaks
 * an older tab. A frame whose JSON does not parse is skipped, never thrown.
 */

export type StreamV2StopReason = "end_turn" | "interrupted" | "tool_use" | "unknown";

export type StreamV2Event =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "status"; code: string }
  | { type: "error"; code: string; message: string }
  | { type: "stop"; stopReason: StreamV2StopReason }
  | { type: "end" };

export interface StreamV2Parser {
  /** Feed the next decoded chunk; returns the events completed by it, in order. */
  push(chunk: string): StreamV2Event[];
  /** Call once when the body has ended. A CR held back at the very end (it might
   *  have been half of a CRLF) is now known to be a whole line ending, so a frame
   *  it terminates is completed. An unfinished frame is still dropped. */
  finish(): StreamV2Event[];
}

const LINE_END = /\r\n|\n|\r/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function toStopReason(v: unknown): StreamV2StopReason {
  return v === "end_turn" || v === "interrupted" || v === "tool_use" ? v : "unknown";
}

/** Maps one complete frame (event name + joined data) to zero or one event. */
export function interpretFrame(eventName: string, data: string): StreamV2Event | null {
  if (data.length === 0) return null;
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(body)) return null;
  const type = eventName && eventName !== "message" ? eventName : asString(body.type);

  switch (type) {
    case "content_block_delta": {
      const delta = body.delta;
      if (!isRecord(delta)) return null;
      if (delta.type === "text_delta") {
        const text = asString(delta.text);
        return text ? { type: "text", text } : null;
      }
      if (delta.type === "thinking_delta") {
        const text = asString(delta.thinking);
        return text ? { type: "thinking", text } : null;
      }
      return null; // input_json_delta and anything newer
    }
    case "status": {
      const code = asString(body.code);
      return code ? { type: "status", code } : null;
    }
    case "error":
      return {
        type: "error",
        code: asString(body.code) ?? "UNKNOWN",
        message: asString(body.message) ?? "",
      };
    case "message_delta": {
      const delta = body.delta;
      return { type: "stop", stopReason: toStopReason(isRecord(delta) ? delta.stopReason : undefined) };
    }
    case "message_stop":
      return { type: "end" };
    default:
      return null; // message_start, content_block_start/stop, unknown
  }
}

export function createStreamV2Parser(): StreamV2Parser {
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];

  function dispatch(out: StreamV2Event[]): void {
    const ev = interpretFrame(eventName, dataLines.join("\n"));
    eventName = "";
    dataLines = [];
    if (ev) out.push(ev);
  }

  function handleLine(line: string, out: StreamV2Event[]): void {
    if (line === "") {
      if (eventName !== "" || dataLines.length > 0) dispatch(out);
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
    // `id`, `retry` and unknown fields are irrelevant here.
  }

  return {
    push(chunk: string): StreamV2Event[] {
      const out: StreamV2Event[] = [];
      buffer += chunk;
      for (;;) {
        const m = LINE_END.exec(buffer);
        if (!m) break;
        // A CR at the very end of the buffer may be the first half of a CRLF
        // whose LF is in the next chunk: wait instead of ending the line now.
        if (m[0] === "\r" && m.index + 1 === buffer.length) break;
        const line = buffer.slice(0, m.index);
        buffer = buffer.slice(m.index + m[0].length);
        handleLine(line, out);
      }
      // An unfinished frame at end of stream is dropped by design (SSE rule);
      // the reader treats "no message_stop" as an interrupted stream.
      return out;
    },
    finish(): StreamV2Event[] {
      const out: StreamV2Event[] = [];
      if (buffer.endsWith("\r")) {
        const line = buffer.slice(0, -1);
        buffer = "";
        handleLine(line, out);
      }
      buffer = "";
      eventName = "";
      dataLines = [];
      return out;
    },
  };
}
