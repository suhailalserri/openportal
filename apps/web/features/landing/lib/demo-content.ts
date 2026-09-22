/**
 * apps/web/features/landing/lib/demo-content.ts
 *
 * Parses content/demo/simulated-chat.json — the sample chat(s) the
 * landing page's demo section plays (typing effect + token counters +
 * cost). One or more SCENARIOS, each naming a model, so the demo can
 * show a small model switcher (e.g. 2-3 flagship models) instead of a
 * single fixed exchange — this is the follow-up round of this phase
 * that added that; a file with exactly one scenario still works exactly
 * as before (the switcher simply doesn't render for a single scenario —
 * see demo-section.tsx).
 *
 * The file ships with INVENTED numbers and `"simulated": true`, which
 * makes the UI show a visible "Simulated example" badge. To go real, run
 * one real chat PER MODEL shown, copy its prompt/reply and the real
 * input/output tokens and cost from the usage log into the matching
 * scenario, and set `"simulated": false`. `modelName`/`modelBadge` are
 * cosmetic labels only — they do not need to be real model IDs, but
 * should not claim a model was used that wasn't, once simulated is false.
 *
 * Fail-closed: anything malformed makes parseDemoContent return null and
 * the section simply does not render — a broken JSON edit must never
 * take the whole landing page down (it is imported at build time, so a
 * syntax error would fail `next build` instead; a *shape* error is what
 * this guards at runtime). A single malformed scenario in an otherwise
 * valid list is DROPPED, not fatal to the whole file — see
 * parseScenario's use in parseDemoContent — so one bad entry can't take
 * down the two good ones next to it.
 */

export interface DemoVariant {
  prompt: string;
  reply: string;
  inputTokens: number;
  outputTokens: number;
  /** Total cost of the exchange in YER, as recorded (not recomputed). */
  costYer: number;
}

export interface DemoScenario {
  /** Stable key for React lists / tab state. Not shown to the user. */
  id: string;
  /** Display label for the model tab, e.g. "Claude Opus". Cosmetic only. */
  modelName: string;
  /** Short badge under/next to the name, e.g. "Best for reasoning". Optional. */
  modelBadge?: string;
  en: DemoVariant;
  ar: DemoVariant;
}

export interface DemoContent {
  simulated: boolean;
  scenarios: DemoScenario[];
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

function parseScenario(raw: unknown, fallbackId: string): DemoScenario | null {
  if (!isRecord(raw)) return null;
  const { id, modelName, modelBadge, en, ar } = raw;
  if (typeof modelName !== "string" || modelName.trim() === "") return null;
  if (modelBadge !== undefined && typeof modelBadge !== "string") return null;
  const enVariant = parseVariant(en);
  const arVariant = parseVariant(ar);
  if (!enVariant || !arVariant) return null;
  // `exactOptionalPropertyTypes: true` (tsconfig.base.json) treats an
  // explicit `modelBadge: undefined` as a DIFFERENT, disallowed shape
  // from simply omitting the key — `modelBadge?: string` means "string,
  // or the key is absent," not "string, or the key is present holding
  // undefined." So the key is spread in only when it's a real string,
  // never assigned undefined directly (that line was the build failure).
  return {
    id: typeof id === "string" && id.trim() !== "" ? id : fallbackId,
    modelName,
    ...(typeof modelBadge === "string" ? { modelBadge } : {}),
    en: enVariant,
    ar: arVariant,
  };
}

/**
 * @returns the validated content, or null when the section is disabled
 * (`"enabled": false`), the file is missing/malformed, or every
 * scenario in it failed to parse (nothing left to show).
 */
export function parseDemoContent(raw: unknown): DemoContent | null {
  if (!isRecord(raw)) return null;
  if (raw.enabled === false) return null;

  // BACKWARD-COMPAT SHAPE: a file with top-level `en`/`ar` (no
  // `scenarios` array) is treated as a single-scenario file — this is
  // the original, pre-multi-model shape, so an old simulated-chat.json
  // that hasn't been migrated yet still parses and renders correctly.
  const rawScenarios = Array.isArray(raw.scenarios)
    ? raw.scenarios
    : raw.en !== undefined || raw.ar !== undefined
      ? [{ modelName: "AI", en: raw.en, ar: raw.ar }]
      : [];

  const scenarios = rawScenarios
    .map((s, i) => parseScenario(s, `scenario-${i}`))
    .filter((s): s is DemoScenario => s !== null);

  if (scenarios.length === 0) return null;

  // Anything other than an explicit `false` counts as simulated, so an
  // omitted flag can never present invented numbers as real.
  return { simulated: raw.simulated !== false, scenarios };
}
