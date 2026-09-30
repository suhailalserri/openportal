/**
 * apps/api/src/monitoring/alert-rules.ts (plan P2.2)
 *
 * Pure sliding-window detectors that replace two Prometheus rules from the
 * retired infra/alerts.yml:
 *   ProviderAllChannelsFailed  -> createErrorRatioWatch (per provider)
 *   BalanceDeductionFailing    -> createCountWatch
 * In-process state (per api replica). Worst case with N replicas: N messages
 * per cooldown. Never throws.
 */

export interface RatioWatchDeps {
  onTrip: (key: string, stats: { total: number; errors: number; ratio: number }) => void;
  now?: () => number;
  windowMs?: number;      // default 2 min
  minEvents?: number;     // default 5: ignore tiny samples (1 of 1 failing is not an outage)
  ratio?: number;         // default 0.5
  cooldownMs?: number;    // default 15 min
}

export function createErrorRatioWatch(deps: RatioWatchDeps) {
  const now = deps.now ?? Date.now;
  const windowMs = deps.windowMs ?? 120_000;
  const minEvents = deps.minEvents ?? 5;
  const threshold = deps.ratio ?? 0.5;
  const cooldownMs = deps.cooldownMs ?? 900_000;
  const events = new Map<string, Array<{ t: number; ok: boolean }>>();
  const lastTrip = new Map<string, number>();

  return {
    record(key: string, ok: boolean): void {
      try {
        const t = now();
        const list = (events.get(key) ?? []).filter((e) => t - e.t < windowMs);
        list.push({ t, ok });
        events.set(key, list);
        const errors = list.filter((e) => !e.ok).length;
        const ratio = errors / list.length;
        const last = lastTrip.get(key);
        if (list.length >= minEvents && ratio > threshold && (last === undefined || t - last >= cooldownMs)) {
          lastTrip.set(key, t);
          deps.onTrip(key, { total: list.length, errors, ratio });
        }
      } catch { /* best-effort */ }
    },
  };
}

export interface CountWatchDeps {
  onTrip: (count: number) => void;
  now?: () => number;
  windowMs?: number;      // default 1 min
  threshold?: number;     // trips when count > threshold; default 5
  cooldownMs?: number;    // default 15 min
}

export function createCountWatch(deps: CountWatchDeps) {
  const now = deps.now ?? Date.now;
  const windowMs = deps.windowMs ?? 60_000;
  const threshold = deps.threshold ?? 5;
  const cooldownMs = deps.cooldownMs ?? 900_000;
  let stamps: number[] = [];
  let lastTrip: number | undefined;

  return {
    record(): void {
      try {
        const t = now();
        stamps = stamps.filter((s) => t - s < windowMs);
        stamps.push(t);
        if (stamps.length > threshold && (lastTrip === undefined || t - lastTrip >= cooldownMs)) {
          lastTrip = t;
          deps.onTrip(stamps.length);
        }
      } catch { /* best-effort */ }
    },
  };
}
