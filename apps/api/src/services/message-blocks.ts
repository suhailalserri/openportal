/**
 * P6.4 (L7): records the structured blocks of one assistant reply while it streams, so they can be
 * saved in `messages.content_blocks`. Pure: no db, config, timers or network (the clock is injected),
 * so it is unit-tested anywhere. Block shapes and the rules readers rely on: packages/types/src/message-blocks.ts.
 *
 * It sits between the StreamNormalizer and the StreamV2Writer as a NormalizeSink: every call is
 * forwarded to the writer FIRST and unchanged (so the wire stream cannot differ because of recording),
 * then mirrored into the block list using the same "one open block" rule the writer enforces:
 *   - text / thinking deltas extend the open block of that kind, otherwise open a new one;
 *   - a tool call opens its own block; its argument pieces are accepted only while it is the open
 *     block and the writer accepted them (a fragment the writer drops is not recorded either).
 * `result()` closes the open block, seals the recorder and returns the blocks (or null if there are
 * none). Anything pushed after `result()` is forwarded but not recorded.
 */
import type { StoredContentBlock, StoredTextBlock, StoredThinkingBlock, StoredToolUseBlock } from "@ai-platform/types";
import type { NormalizeSink } from "./stream-normalize";

/**
 * Storage cap for ONE thinking block, in characters. A reply is bounded by the 120 s stream ceiling,
 * so this is a guard against a runaway model filling the row, not a limit people should meet. Text
 * blocks are never cut: `content` must stay complete.
 */
export const MAX_THINKING_CHARS = 200_000;

type Open =
  | { kind: "text"; block: StoredTextBlock }
  | { kind: "thinking"; block: StoredThinkingBlock; startedAt: number }
  | { kind: "tool_use"; block: StoredToolUseBlock; raw: string };

/** Valid JSON of any type becomes `input`; anything else is kept verbatim in `inputRaw`. */
function parseToolInput(raw: string): { input: unknown; inputRaw?: string } {
  if (raw.trim() === "") return { input: {} };          // a call with no arguments
  try {
    return { input: JSON.parse(raw) as unknown };
  } catch {
    return { input: null, inputRaw: raw };              // cut mid-JSON by an interrupted stream
  }
}

/** The flat text projection: the concatenation of the text blocks, in order. */
export function flattenTextBlocks(blocks: readonly StoredContentBlock[]): string {
  let out = "";
  for (const b of blocks) if (b.type === "text") out += b.text;
  return out;
}

export class BlockRecorder implements NormalizeSink {
  private readonly done: StoredContentBlock[] = [];
  private open: Open | null = null;
  private sealed = false;

  constructor(
    private readonly inner: NormalizeSink,
    private readonly now: () => number = Date.now,
  ) {}

  text(text: string): void {
    this.inner.text(text);
    if (this.sealed || text.length === 0) return;
    let open = this.open;
    if (open?.kind !== "text") {
      this.close();
      open = { kind: "text", block: { type: "text", text: "" } };
      this.open = open;
    }
    open.block.text += text;
  }

  thinking(thinking: string): void {
    this.inner.thinking(thinking);
    if (this.sealed || thinking.length === 0) return;
    let open = this.open;
    if (open?.kind !== "thinking") {
      this.close();
      open = { kind: "thinking", block: { type: "thinking", thinking: "" }, startedAt: this.now() };
      this.open = open;
    }
    const block = open.block;
    const room = MAX_THINKING_CHARS - block.thinking.length;
    if (room <= 0) { block.truncated = true; return; }
    if (thinking.length <= room) { block.thinking += thinking; return; }
    let cut = thinking.slice(0, room);
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);   // never end on half a surrogate pair
    block.thinking += cut;
    block.truncated = true;
  }

  toolStart(id: string, name: string): void {
    this.inner.toolStart(id, name);
    if (this.sealed) return;
    this.close();
    this.open = { kind: "tool_use", block: { type: "tool_use", id, name, input: {} }, raw: "" };
  }

  toolArgs(id: string, partialJson: string): boolean {
    const accepted = this.inner.toolArgs(id, partialJson);
    if (accepted && !this.sealed && this.open?.kind === "tool_use" && this.open.block.id === id) {
      this.open.raw += partialJson;
    }
    return accepted;
  }

  /** Close the open block, seal, and return the blocks in order; null when nothing was recorded. */
  result(): StoredContentBlock[] | null {
    if (!this.sealed) {
      this.close();
      this.sealed = true;
    }
    return this.done.length > 0 ? [...this.done] : null;
  }

  private close(): void {
    const open = this.open;
    this.open = null;
    if (open === null) return;
    if (open.kind === "text") {
      this.done.push(open.block);
    } else if (open.kind === "thinking") {
      this.done.push({ ...open.block, durationMs: Math.max(0, Math.round(this.now() - open.startedAt)) });
    } else {
      this.done.push({ ...open.block, ...parseToolInput(open.raw) });
    }
  }
}
