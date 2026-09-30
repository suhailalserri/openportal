/**
 * P6.1 (L7): structured chat stream, protocol v2.
 *
 * Negotiated per request with `Accept: application/vnd.aip.stream+v2`. Anything else keeps the
 * plain-text v1 stream (raw content bytes, `text/plain`) exactly as before.
 *
 * Wire format: Server-Sent Events, one event per frame, Anthropic-Messages style:
 *   event: <type>\ndata: <json>\n\n
 * Order: message_start, then zero or more blocks (content_block_start, content_block_delta*,
 * content_block_stop; at most one block open at a time), then message_delta, then message_stop.
 * `message_stop` is ALWAYS the last event and is sent exactly once, including after an error.
 * An `error` event is informational and may appear before message_delta.
 */

/** Negotiated per request (see the header above). Runtime helpers live in apps/api (services/stream-v2.ts). */
export type StreamVersion = "v1" | "v2";

export type StreamBlockType = "text" | "thinking" | "tool_use" | "tool_result" | "attachment_ref";

export type StreamBlockStart =
  | { type: "text" }
  | { type: "thinking" }
  | { type: "tool_use"; id: string; name: string }
  | { type: "tool_result"; toolUseId: string }
  | { type: "attachment_ref"; attachmentId: string };

export type StreamBlockDelta =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "input_json_delta"; partialJson: string };

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  /** Micro-credits the request costs (what is charged for this turn; 0 when nothing is billed). */
  creditCost: number;
}

/** "end_turn" = finished normally; "interrupted" = the upstream stream broke (partial answer, still billed). */
export type StreamStopReason = "end_turn" | "interrupted";

export type StreamEvent =
  | { type: "message_start"; message: { id: string; model: string; role: "assistant" } }
  | { type: "content_block_start"; index: number; contentBlock: StreamBlockStart }
  | { type: "content_block_delta"; index: number; delta: StreamBlockDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stopReason: StreamStopReason }; usage: StreamUsage }
  | { type: "message_stop" }
  | { type: "error"; code: string; message: string };
