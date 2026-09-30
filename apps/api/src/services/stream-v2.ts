/**
 * P6.1 (L7): pure emitter for the structured chat stream (protocol v2). No db, config or network
 * imports, so it is unit-tested anywhere. Wire format and event order: packages/types/src/stream.types.ts.
 *
 * Guarantees (each has a test):
 *   - message_start is sent once, before any block;
 *   - at most one block is open; a block is closed before the next opens and before the tail;
 *   - finish() sends [content_block_stop] message_delta message_stop exactly once, in that order,
 *     and everything after it is a no-op, so the stream ends with message_stop no matter how it ended;
 *   - a write that throws (client already gone) never throws out of the emitter.
 */
import type {
  StreamBlockDelta, StreamBlockStart, StreamEvent, StreamStopReason, StreamUsage, StreamVersion,
} from "@ai-platform/types";

export const STREAM_V2_MEDIA_TYPE = "application/vnd.aip.stream+v2";

/**
 * v2 only when Accept explicitly lists the v2 media type with q > 0. A wildcard range, a missing
 * header or an unknown vendor type stay on v1, so no existing caller changes.
 */
export function negotiateStreamVersion(accept: string | string[] | null | undefined): StreamVersion {
  const header = Array.isArray(accept) ? accept.join(",") : accept;
  if (!header) return "v1";
  for (const range of header.split(",")) {
    const [type, ...params] = range.split(";").map((p) => p.trim().toLowerCase());
    if (type !== STREAM_V2_MEDIA_TYPE) continue;
    const q = params.find((p) => p.startsWith("q="));
    if (q !== undefined && !(Number(q.slice(2)) > 0)) continue;
    return "v2";
  }
  return "v1";
}

/** One SSE frame. JSON.stringify never emits a raw newline, so one `data:` line is always enough. */
export function formatStreamEvent(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export class StreamV2Writer {
  private started = false;
  private finished = false;
  private nextIndex = 0;
  /** Index of the open block and its kind, or null when none is open. */
  private open: { index: number; kind: StreamBlockStart["type"] } | null = null;

  constructor(
    private readonly write: (frame: string) => void,
    private readonly meta: { id: string; model: string },
  ) {}

  private emit(event: StreamEvent): void {
    try { this.write(formatStreamEvent(event)); } catch { /* client gone: nothing to tell */ }
  }

  start(): void {
    if (this.started || this.finished) return;
    this.started = true;
    this.emit({ type: "message_start", message: { id: this.meta.id, model: this.meta.model, role: "assistant" } });
  }

  /** Append streamed text, opening a text block if the current block is not one. */
  text(text: string): void {
    if (this.finished || text.length === 0) return;
    this.start();
    this.ensureBlock({ type: "text" });
    this.emit({ type: "content_block_delta", index: this.open!.index, delta: { type: "text_delta", text } });
  }

  /** Generic entry point for P6.2 (thinking, tool_use): same block rules as text(). */
  delta(block: StreamBlockStart, delta: StreamBlockDelta): void {
    if (this.finished) return;
    this.start();
    this.ensureBlock(block);
    this.emit({ type: "content_block_delta", index: this.open!.index, delta });
  }

  /** Informational; does not end the stream (finish() still must be called). */
  error(code: string, message: string): void {
    if (this.finished) return;
    this.start();
    this.closeBlock();
    this.emit({ type: "error", code, message });
  }

  finish(stopReason: StreamStopReason, usage: StreamUsage): void {
    if (this.finished) return;
    this.start();
    this.closeBlock();
    this.finished = true;
    this.emit({ type: "message_delta", delta: { stopReason }, usage });
    this.emit({ type: "message_stop" });
  }

  private ensureBlock(block: StreamBlockStart): void {
    // A block of the same kind stays open (text deltas append). tool_use/tool_result always open anew.
    if (this.open && this.open.kind === block.type && (block.type === "text" || block.type === "thinking")) return;
    this.closeBlock();
    const index = this.nextIndex++;
    this.open = { index, kind: block.type };
    this.emit({ type: "content_block_start", index, contentBlock: block });
  }

  private closeBlock(): void {
    if (!this.open) return;
    const { index } = this.open;
    this.open = null;
    this.emit({ type: "content_block_stop", index });
  }
}
