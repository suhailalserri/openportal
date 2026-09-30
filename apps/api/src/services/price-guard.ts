/**
 * apps/api/src/services/price-guard.ts (plan P3.6, closes N7)
 *
 * Pure logic for the provider-cost guard. No database, Redis or Telegram
 * imports on purpose: everything here is a function of its arguments, so it
 * is unit-tested without containers and can never take a request path down.
 *
 * Money model (same as gateway.service.ts):
 *   sell price per 1M tokens = wholesaleCostPerM * markupMultiplier
 *   real cost per 1M tokens  = upstream price if we know it, else our wholesale
 * A model is "below cost" when sell < real cost on either the input or output
 * side. Sides whose real cost is 0 (genuinely free) are skipped.
 */

/** Minimum acceptable gross margin, 0..1 (D2: 40%, same bar as the old price-audit script). */
export const MIN_GROSS_MARGIN = 0.4;
/** Relative difference between our wholesale and the upstream price that counts as drift. */
export const DRIFT_TOLERANCE = 0.05;
/** Where upstream prices come from (public, no key). OpenRouter is the real provider per ADR-011. */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const EPS = 1e-9;

export interface PricedModel {
  id: string;
  markup: number;       // markupMultiplier
  wholesaleIn: number;  // USD per 1M input tokens (what WE believe the cost is)
  wholesaleOut: number; // USD per 1M output tokens
}

export interface UpstreamPrice {
  input: number;  // USD per 1M tokens
  output: number;
}

export type FindingKind = "below_cost" | "low_margin" | "zero_wholesale" | "upstream_drift";
export type Severity = "critical" | "warning";

export interface Finding {
  modelId: string;
  kind: FindingKind;
  severity: Severity;
  detail: string;
}

export interface Evaluation {
  findings: Finding[];
  /** Models evaluated. */
  checked: number;
  /** Ids with no upstream match. Empty when no upstream feed was supplied. */
  unchecked: string[];
}

export interface EvaluateOptions {
  minMargin?: number;
  driftTolerance?: number;
}

const isFreeId = (id: string) => id.endsWith(":free");

/** $ per 1M, trimmed: 2.5 -> "2.5", 0.0750 -> "0.075". */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  return `$${Number(n.toFixed(6))}`;
}

function fmtPct(n: number): string {
  if (n === -Infinity) return "-inf%";
  return `${Math.round(n * 100)}%`;
}

/**
 * `upstream` = null means "no upstream feed available": only local checks run
 * and `unchecked` stays empty. A Map means the feed was fetched: models absent
 * from it are reported in `unchecked` (never silently passed).
 */
export function evaluateModelPrices(
  models: PricedModel[],
  upstream: Map<string, UpstreamPrice> | null,
  opts: EvaluateOptions = {},
): Evaluation {
  const minMargin = opts.minMargin ?? MIN_GROSS_MARGIN;
  const tol = opts.driftTolerance ?? DRIFT_TOLERANCE;
  const findings: Finding[] = [];
  const unchecked: string[] = [];

  for (const m of models) {
    const up = upstream ? (upstream.get(m.id) ?? upstream.get(m.id.toLowerCase())) : undefined;
    if (upstream && !up) unchecked.push(m.id);

    // ── margin per side, against the real cost when we know it ──────────
    const sides = [
      { name: "input", wholesale: m.wholesaleIn, cost: up ? up.input : m.wholesaleIn },
      { name: "output", wholesale: m.wholesaleOut, cost: up ? up.output : m.wholesaleOut },
    ];
    let worst: { name: string; margin: number; sell: number; cost: number } | null = null;
    for (const s of sides) {
      if (!(s.cost > 0)) continue; // genuinely free side: nothing to lose
      const sell = s.wholesale * m.markup;
      const margin = sell > 0 ? (sell - s.cost) / sell : -Infinity;
      if (!worst || margin < worst.margin) worst = { name: s.name, margin, sell, cost: s.cost };
    }

    if (worst && worst.margin < 0) {
      findings.push({
        modelId: m.id, kind: "below_cost", severity: "critical",
        detail: `${worst.name} sells at ${fmtUsd(worst.sell)}/M but costs ${fmtUsd(worst.cost)}/M (margin ${fmtPct(worst.margin)})`,
      });
    } else if (worst && worst.margin + EPS < minMargin) {
      findings.push({
        modelId: m.id, kind: "low_margin", severity: "warning",
        detail: `${worst.name} margin ${fmtPct(worst.margin)} is below ${fmtPct(minMargin)} (sell ${fmtUsd(worst.sell)}/M, cost ${fmtUsd(worst.cost)}/M)`,
      });
    }

    // ── billed at zero with nothing saying it is free ───────────────────
    if (!up && !isFreeId(m.id) && !(m.wholesaleIn > 0) && !(m.wholesaleOut > 0)) {
      findings.push({
        modelId: m.id, kind: "zero_wholesale", severity: "warning",
        detail: "wholesale cost is 0 on both sides but the model is not free: it is being billed at 0",
      });
    }

    // ── our wholesale no longer matches the upstream price ──────────────
    if (up) {
      const diffs: string[] = [];
      for (const [name, ours, theirs] of [
        ["input", m.wholesaleIn, up.input],
        ["output", m.wholesaleOut, up.output],
      ] as const) {
        const denom = Math.max(ours, theirs);
        if (denom > 0 && Math.abs(ours - theirs) / denom > tol) {
          diffs.push(`${name} ours ${fmtUsd(ours)}/M vs upstream ${fmtUsd(theirs)}/M`);
        }
      }
      if (diffs.length > 0) {
        findings.push({
          modelId: m.id, kind: "upstream_drift", severity: "warning",
          detail: `wholesale differs from upstream: ${diffs.join("; ")}`,
        });
      }
    }
  }

  return { findings, checked: models.length, unchecked };
}

// ── Digest ───────────────────────────────────────────────────────────────

const MAX_LINES = 15;

/**
 * Plain-text digest, or null when there is nothing to report.
 * `upstreamError` (feed unreachable) is reported even with no findings, so a
 * silently broken check cannot look like a healthy one.
 */
export function formatDigest(
  ev: Evaluation,
  opts: { upstreamError?: string | undefined } = {},
): { level: "warning" | "critical"; message: string } | null {
  if (ev.findings.length === 0 && !opts.upstreamError) return null;

  const critical = ev.findings.filter((f) => f.severity === "critical");
  const rank = (f: Finding) => (f.severity === "critical" ? 0 : 1);
  const sorted = [...ev.findings].sort((a, b) => rank(a) - rank(b));

  const head =
    `Price guard: ${critical.length} critical, ${ev.findings.length - critical.length} warning ` +
    `(checked ${ev.checked}, no upstream match ${ev.unchecked.length})`;
  const lines = sorted.slice(0, MAX_LINES).map(
    (f) => `${f.severity === "critical" ? "CRITICAL" : "warn"} ${f.kind} ${f.modelId}: ${f.detail}`,
  );
  if (sorted.length > MAX_LINES) lines.push(`... and ${sorted.length - MAX_LINES} more (run price-audit for the full list)`);
  if (opts.upstreamError) lines.push(`Upstream price feed unavailable, drift not checked: ${opts.upstreamError}`);

  return {
    level: critical.length > 0 ? "critical" : "warning",
    message: [head, ...lines].join("\n"),
  };
}

// ── Upstream feed ────────────────────────────────────────────────────────

/**
 * Parses OpenRouter's /api/v1/models body into USD-per-1M prices.
 * OpenRouter quotes USD per TOKEN as strings; "-1" marks dynamic-priced
 * routers (skipped). Never throws on a malformed entry: it is skipped.
 */
export function parseOpenRouterPrices(body: unknown): Map<string, UpstreamPrice> {
  const out = new Map<string, UpstreamPrice>();
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return out;
  const perM = (v: unknown): number | null => {
    const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1e6 * 1e6) / 1e6;
  };
  for (const raw of data) {
    const r = raw as { id?: unknown; canonical_slug?: unknown; pricing?: { prompt?: unknown; completion?: unknown } };
    if (typeof r?.id !== "string" || r.id.length === 0) continue;
    const input = perM(r.pricing?.prompt);
    const output = perM(r.pricing?.completion);
    if (input === null || output === null) continue;
    const price = { input, output };
    out.set(r.id, price);
    if (typeof r.canonical_slug === "string" && r.canonical_slug && !out.has(r.canonical_slug)) {
      out.set(r.canonical_slug, price);
    }
  }
  return out;
}

/** Throws on network/HTTP/shape failure; the caller decides how to degrade. */
export async function fetchOpenRouterPrices(
  opts: { fetchImpl?: typeof fetch; url?: string; timeoutMs?: number } = {},
): Promise<Map<string, UpstreamPrice>> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(opts.url ?? OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) throw new Error(`OpenRouter models list returned ${res.status}`);
  const prices = parseOpenRouterPrices(await res.json());
  if (prices.size === 0) throw new Error("OpenRouter models list had no usable prices");
  return prices;
}
