/**
 * apps/web/features/chat/lib/token-estimate.ts
 *
 * Phase 4c (rework). A script-aware token ESTIMATOR, used ONLY for the
 * "≈ credits" cost line in the composer.
 *
 * WHY NOT `ceil(chars / 4)`: that rule (packages/config's
 * `estimateTokenCount`) is an English rule of thumb. Tokenizers spend far
 * more tokens per character on other scripts — Arabic runs roughly 2–3
 * characters per token, CJK about one token per character, and an emoji
 * costs 1–4 tokens while JS `.length` counts it as 2 UTF-16 units. So for
 * an Arabic-speaking user `chars/4` under-quotes the cost by ~1.5–2×.
 *
 * WHAT THIS IS NOT:
 *  - It is NOT what the server bills. Billing uses the provider-reported
 *    `usage` (gateway.service.ts). This number is a pre-send quote.
 *  - It is NOT the send-block. The 95%-of-context block deliberately keeps
 *    mirroring the server's own `chars/4` (lib/context-estimate.ts) so the
 *    client and the server can never disagree about "too long".
 *  - It is NOT measured. No tokenizer was available when this was
 *    written (no network). The weights below come from the known
 *    behaviour of BPE tokenizers, are good to roughly ±30%, differ per
 *    provider (GPT / Claude / Gemini / DeepSeek), and lean HIGH on
 *    purpose: an over-quote is a pleasant surprise, an under-quote isn't.
 *    All tuning lives in WEIGHTS — nothing else in this file needs to
 *    change if you calibrate against real usage numbers.
 *
 * Iteration is by CODE POINT (`for…of`), not UTF-16 unit, so an emoji is
 * one step, not two.
 *
 * ENGLISH REGRESSION GUARD: letters + whitespace stay at exactly 0.25, so
 * plain English text still comes out at `ceil(chars / 4)`, the same as the
 * server. Only other scripts, digits, symbols and emoji move.
 */
export const WEIGHTS = {
  /** ASCII letters, space, tab, newline. */
  latin: 0.25,
  /** ASCII digits (tokenizers group ~2–3 digits per token). */
  digit: 0.5,
  /** ASCII punctuation/symbols. Common ones merge with neighbours, rare
   *  ones are a token each — this sits between the two. */
  asciiSymbol: 0.6,
  /** Arabic-script letters. */
  arabic: 0.45,
  /** Arabic diacritics (tashkeel), tatweel, Arabic-Indic digits. */
  arabicMark: 0.5,
  /** Chinese / Japanese / Korean. */
  cjk: 1.0,
  /** Emoji and other astral-plane characters. */
  astral: 2.0,
  /** BMP symbol blocks (arrows, misc symbols, dingbats), ZWJ, variation
   *  selectors — the parts of an emoji sequence that are not astral. */
  bmpSymbol: 1.0,
  /** Everything else (Cyrillic, Greek, Hebrew, accented Latin, Indic…). */
  other: 0.5,
} as const;

/** Chat formats add a few tokens of role/framing per message. */
export const MESSAGE_OVERHEAD_TOKENS = 4;

function inRange(cp: number, lo: number, hi: number): boolean {
  return cp >= lo && cp <= hi;
}

/** Weight (tokens) of one code point. Exported for tests. */
export function codePointWeight(cp: number): number {
  // ASCII fast path.
  if (cp < 0x80) {
    if (cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d) return WEIGHTS.latin;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return WEIGHTS.latin;
    if (cp >= 0x30 && cp <= 0x39) return WEIGHTS.digit;
    return WEIGHTS.asciiSymbol;
  }

  // Arabic marks: tashkeel, superscript alef, Quranic marks, tatweel,
  // Arabic-Indic and Persian digits.
  if (
    inRange(cp, 0x064b, 0x065f) ||
    cp === 0x0670 ||
    inRange(cp, 0x06d6, 0x06ed) ||
    cp === 0x0640 ||
    inRange(cp, 0x0660, 0x0669) ||
    inRange(cp, 0x06f0, 0x06f9)
  ) {
    return WEIGHTS.arabicMark;
  }

  // Arabic letters (main block + supplement + extended-A + presentation forms).
  if (
    inRange(cp, 0x0600, 0x06ff) ||
    inRange(cp, 0x0750, 0x077f) ||
    inRange(cp, 0x08a0, 0x08ff) ||
    inRange(cp, 0xfb50, 0xfdff) ||
    inRange(cp, 0xfe70, 0xfeff)
  ) {
    return WEIGHTS.arabic;
  }

  // CJK: kana, CJK ext-A, unified ideographs, Hangul, compatibility.
  if (
    inRange(cp, 0x3040, 0x30ff) ||
    inRange(cp, 0x3400, 0x4dbf) ||
    inRange(cp, 0x4e00, 0x9fff) ||
    inRange(cp, 0xac00, 0xd7af) ||
    inRange(cp, 0xf900, 0xfaff)
  ) {
    return WEIGHTS.cjk;
  }

  // Emoji & everything outside the BMP.
  if (cp >= 0x10000) return WEIGHTS.astral;

  // BMP symbol blocks + joiners used inside emoji sequences.
  if (
    inRange(cp, 0x2190, 0x2bff) ||
    inRange(cp, 0x2600, 0x27bf) ||
    cp === 0x200d ||
    inRange(cp, 0xfe00, 0xfe0f) ||
    cp === 0x20e3
  ) {
    return WEIGHTS.bmpSymbol;
  }

  return WEIGHTS.other;
}

/** Fractional token weight of a string (no rounding, no overhead). */
export function tokenWeight(text: string): number {
  let sum = 0;
  for (const ch of text) sum += codePointWeight(ch.codePointAt(0) ?? 0);
  return sum;
}

/** Estimated tokens for one string, rounded UP. 0 for the empty string. */
export function estimateTokensWeighted(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(tokenWeight(text));
}
