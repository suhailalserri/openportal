/**
 * P6.2 (L7): maps one upstream OpenAI-style streaming chunk onto structured blocks. Pure: no db,
 * config, timers or network, so it is unit-tested anywhere. Only the v2 stream uses it; v1 keeps
 * reading `delta.content` itself and never sees reasoning or tool chunks.
 *
 * Upstream shapes handled (all arrive through the New API gateway, field names vary by provider):
 *   - `delta.content`            -> text block
 *   - `delta.reasoning_content`  -> thinking block (DeepSeek-style)
 *   - `delta.reasoning`          -> thinking block (OpenRouter alias; `reasoning_content` wins if both)
 *   - `delta.tool_calls[]`       -> one tool_use block per call. The first fragment carries id + name,
 *                                   later fragments carry `function.arguments` pieces and are forwarded
 *                                   as input_json_delta. Parallel calls are told apart by `index`
 *                                   (or by a new `id` when a provider reuses one index).
 *   - `finish_reason`            -> remembered (`tool_calls` becomes stopReason "tool_use")
 * Anything else (role-only chunks, usage chunks, empty deltas) produces nothing.
 *
 * Limit, deliberate: the protocol allows one open block at a time, so tool-call fragments must arrive
 * call by call (what OpenAI, OpenRouter and DeepSeek do). A fragment for a call that was already closed
 * by a later block is dropped and counted in `droppedToolFragments`, never written into another block.
 */

/** The part of StreamV2Writer the normalizer needs (structural, so tests can pass a recorder). */
export interface NormalizeSink {
  text(text: string): void;
  thinking(thinking: string): void;
  toolStart(id: string, name: string): void;
  toolArgs(id: string, partialJson: string): boolean;
}

/** How long the upstream may stay silent before the v2 stream sends one honest `status` event. */
export const STATUS_AFTER_MS = 2_000;

interface ToolCallState {
  id: string;
  /** false while the id is one we made up because the provider sent none. */
  realId: boolean;
  name: string | null;
  started: boolean;
  /** Argument pieces that arrived before the name (rare); flushed when the block opens. */
  pending: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export class StreamNormalizer {
  /** All text received so far (what the saved assistant message contains, as in v1). */
  text = "";
  /** Reasoning text plus tool-call arguments: billable output that is not part of `text`. */
  extraOutput = "";
  /** Upstream `finish_reason` of the last chunk that carried one. */
  finishReason: string | null = null;
  droppedToolFragments = 0;

  private readonly calls = new Map<number, ToolCallState>();
  private lastCallIndex: number | null = null;

  constructor(
    private readonly sink: NormalizeSink,
    /** Used to build ids for tool calls whose provider sent none, e.g. the request id. */
    private readonly idPrefix: string,
  ) {}

  /** Feed one parsed upstream chunk. Returns true when something was forwarded to the client. */
  push(chunk: unknown): boolean {
    const choice = isObject(chunk) && Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (!isObject(choice)) return false;
    if (nonEmptyString(choice.finish_reason)) this.finishReason = choice.finish_reason;

    const delta = choice.delta;
    if (!isObject(delta)) return false;
    let emitted = false;

    // Order inside one chunk: reasoning, then text, then tool calls (the order a model produces them).
    const reasoning = nonEmptyString(delta.reasoning_content) ? delta.reasoning_content
      : nonEmptyString(delta.reasoning) ? delta.reasoning : null;
    if (reasoning !== null) {
      this.extraOutput += reasoning;
      this.sink.thinking(reasoning);
      emitted = true;
    }

    if (nonEmptyString(delta.content)) {
      this.text += delta.content;
      this.sink.text(delta.content);
      emitted = true;
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const fragment of delta.tool_calls) {
        if (isObject(fragment) && this.pushToolFragment(fragment)) emitted = true;
      }
    }
    return emitted;
  }

  private resolveIndex(fragment: Record<string, unknown>): number {
    if (typeof fragment.index === "number" && Number.isInteger(fragment.index) && fragment.index >= 0) return fragment.index;
    // No index: a fragment with an id starts (or continues) that call; one without continues the last call.
    if (nonEmptyString(fragment.id)) {
      for (const [i, c] of this.calls) if (c.id === fragment.id) return i;
      return this.calls.size === 0 ? 0 : Math.max(...this.calls.keys()) + 1;
    }
    return this.lastCallIndex ?? 0;
  }

  private pushToolFragment(fragment: Record<string, unknown>): boolean {
    const idx = this.resolveIndex(fragment);
    const upstreamId = nonEmptyString(fragment.id) ? fragment.id : null;

    let call = this.calls.get(idx);
    // A provider that reuses one index for several calls announces each with a new id.
    if (call && call.realId && upstreamId !== null && call.id !== upstreamId) call = undefined;
    if (!call) {
      call = { id: upstreamId ?? `${this.idPrefix}_call_${idx}`, realId: upstreamId !== null, name: null, started: false, pending: "" };
      this.calls.set(idx, call);
    } else if (!call.realId && upstreamId !== null && !call.started) {
      call.id = upstreamId;
      call.realId = true;
    }
    this.lastCallIndex = idx;

    const fn = isObject(fragment.function) ? fragment.function : {};
    if (call.name === null && nonEmptyString(fn.name)) call.name = fn.name;
    const args = typeof fn.arguments === "string" ? fn.arguments : "";

    if (!call.started) {
      call.pending += args;
      if (call.name === null) return false;
      this.sink.toolStart(call.id, call.name);
      call.started = true;
      this.forwardArgs(call, call.pending);
      call.pending = "";
      return true;
    }
    return this.forwardArgs(call, args);
  }

  private forwardArgs(call: ToolCallState, json: string): boolean {
    if (json.length === 0) return false;
    this.extraOutput += json;
    if (this.sink.toolArgs(call.id, json)) return true;
    this.droppedToolFragments++;
    return false;
  }
}
