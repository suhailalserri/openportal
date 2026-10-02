/**
 * P6.4 (L7): the shape of `messages.content_blocks`, the persisted form of an assistant reply.
 * Types only (this package is not transpiled for the web build); runtime helpers live in
 * `apps/api/src/services/message-blocks.ts`.
 *
 * Rules every reader and writer relies on:
 *   - `content_blocks` is an ORDERED JSON array. NULL means "no structure was recorded" (every row
 *     written before P6.4, and every reply streamed in v1): readers treat it as one text block made
 *     of `content`.
 *   - `messages.content` stays the flat projection used by search, export and history sent back to
 *     the model: it equals the concatenation of the `text` blocks, in order. Reasoning and tool
 *     blocks are never part of it.
 *   - Readers must ignore a block whose `type` they do not know, so new kinds can be added later
 *     (`tool_result`, `attachment_ref`) without a migration.
 */

export interface StoredTextBlock {
  type: "text";
  text: string;
}

export interface StoredThinkingBlock {
  type: "thinking";
  thinking: string;
  /** Milliseconds from the first reasoning delta to the end of the block. Absent when unknown. */
  durationMs?: number;
  /** True when `thinking` was cut at the storage cap (the full text was still streamed and billed). */
  truncated?: true;
}

export interface StoredToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  /** The parsed arguments. `null` when the arguments were not valid JSON (see `inputRaw`). */
  input: unknown;
  /** The raw argument text, kept only when it did not parse (an interrupted stream cuts JSON mid-way). */
  inputRaw?: string;
}

export type StoredContentBlock = StoredTextBlock | StoredThinkingBlock | StoredToolUseBlock;
