/**
 * apps/web/features/landing/lib/stream-demo.ts
 *
 * Phase 3.3. Pure helpers behind the landing page's "example
 * conversation" so it can PLAY BACK like a live model stream (token by
 * token, markdown rendered as it arrives) — no network, no cost, and
 * unit-testable without a browser.
 *
 * This is a replay of a stored reply, not a call to a model: the
 * section keeps its "Simulated example" badge until real numbers are
 * pasted into content/demo/simulated-chat.json.
 */

/**
 * Splits text into stream "tokens": a word plus its trailing
 * whitespace, or a run of whitespace. Joined back together they equal
 * the input exactly. Whitespace-based on purpose: Arabic words must
 * never be split mid-word.
 */
export function chunkForStream(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/**
 * Makes a PARTIAL markdown string safe to render mid-stream, so the
 * reader never sees stray `**` / a lone `*` / an open backtick flash on
 * screen before the closing marker arrives.
 */
export function balanceMarkdown(partial: string): string {
  let out = partial;

  // A single trailing "*" may be the first half of a "**" still arriving.
  if (/[^*]\*$/.test(out) || out === "*") out = out.slice(0, -1);

  const bold = (out.match(/\*\*/g) ?? []).length;
  if (bold % 2 === 1) out += "**";

  const ticks = (out.match(/`/g) ?? []).length;
  if (ticks % 2 === 1) out += "`";

  return out;
}

/**
 * Delay (ms) before revealing the next token. A steady base with a
 * short extra pause after sentence punctuation and line breaks, so it
 * reads like a model thinking rather than a metronome.
 */
export function delayAfter(token: string, baseMs = 34): number {
  if (/\n\s*$/.test(token)) return baseMs + 140;
  if (/[.!?؟:،,;]\s*$/.test(token)) return baseMs + 90;
  return baseMs;
}
