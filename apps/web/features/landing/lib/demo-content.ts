/**
 * apps/web/features/landing/lib/demo-content.ts
 *
 * Parses content/demo/simulated-chat.json — the sample chat the landing
 * page's demo section plays (typing effect + token counters + cost).
 *
 * The file ships with INVENTED numbers and `"simulated": true`, which
 * makes the UI show a visible "Simulated example" badge. To go real, run
 * one real chat, copy its prompt/reply and the input/output tokens and
 * cost from the usage log into the JSON, and set `"simulated": false`.
 *
 * Fail-closed: anything malformed makes parseDemoContent return null and
 * the section simply does not render — a broken JSON edit must never
 * take the whole landing page down (it is imported at build time, so a
 * syntax error would fail `next build` instead; a *shape* error is what
 * this guards at runtime).
 */

export interface DemoVariant {
  prompt: string;
  reply: string;
  inputTokens: number;
  outputTokens: number;
  /** Total cost of the exchange in YER, as recorded (not recomputed). */
  costYer: number;
}

export interface DemoContent {
  simulated: boolean;
  en: DemoVariant;
  ar: DemoVariant;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function parseVariant(raw: unknown): DemoVariant | null {
  if (!isRecord(raw)) return null;
  const { prompt, reply, inputTokens, outputTokens, costYer } = raw;
  if (typeof prompt !== "string" || prompt.trim() === "") return null;
  if (typeof reply !== "string" || reply.trim() === "") return null;
  if (!isNonNegativeNumber(inputTokens) || !isNonNegativeNumber(outputTokens)) return null;
  if (!isNonNegativeNumber(costYer)) return null;
  return { prompt, reply, inputTokens, outputTokens, costYer };
}

/**
 * @returns the validated content, or null when the section is disabled
 * (`"enabled": false`) or the file is missing/malformed.
 */
export function parseDemoContent(raw: unknown): DemoContent | null {
  if (!isRecord(raw)) return null;
  if (raw.enabled === false) return null;
  const en = parseVariant(raw.en);
  const ar = parseVariant(raw.ar);
  if (!en || !ar) return null;
  // Anything other than an explicit `false` counts as simulated, so an
  // omitted flag can never present invented numbers as real.
  return { simulated: raw.simulated !== false, en, ar };
}
