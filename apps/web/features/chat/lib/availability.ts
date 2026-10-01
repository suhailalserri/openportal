import { callJson } from "./voice-client";

/**
 * apps/web/features/chat/lib/availability.ts
 *
 * P6.3e. "Is this backend feature ready?" for the attach button and the mic, as plain functions (no React,
 * no browser), so the decisions are tested.
 *
 * WHY THIS EXISTS: P6.3b/c asked once per page load and treated ANY failure as "not available", forever, so
 * one slow answer (a cold api past the proxy's 15 s limit) made the button disappear for the whole visit with
 * no way to tell why. Now:
 *   - a definite "no" (`available:false`, or signed out) is final and is NOT retried;
 *   - anything else (network error, 5xx, config error) is retried with a short backoff;
 *   - after the retries the person sees a disabled button with a reason, never an empty gap;
 *   - an answer that was good a moment ago is remembered, so remounting the chat (a new chat becomes
 *     /chat/<id>) does not flash the button away, and a later transient failure does not remove it.
 */

export type AvailabilityReason = "notConfigured" | "unreachable" | "signedOut";

export type AvailabilityState =
  | { phase: "checking" }
  | { phase: "ready" }
  | { phase: "unavailable"; reason: AvailabilityReason; code: string };

export type ProbeResult =
  | { available: true }
  | { available: false; reason: AvailabilityReason; code: string };

type FetchLike = typeof fetch;

/** Waits before retry 1 and retry 2: three attempts in all. */
export const PROBE_DELAYS_MS: readonly number[] = [1000, 3000];

const READY_MEMORY_TTL_MS = 10 * 60 * 1000;

export interface ProbeOptions {
  signal?: AbortSignal | undefined;
  delaysMs?: readonly number[] | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function probeAvailability(
  path: string,
  fetchImpl: FetchLike = fetch,
  opts: ProbeOptions = {},
): Promise<ProbeResult> {
  const delays = opts.delaysMs ?? PROBE_DELAYS_MS;
  const sleep = opts.sleep ?? defaultSleep;
  let lastCode = "UNKNOWN";

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (attempt > 0) await sleep(delays[attempt - 1] ?? 0);
    if (opts.signal?.aborted) return { available: false, reason: "unreachable", code: "ABORTED" };

    const r = await callJson<{ available?: unknown } | null>(fetchImpl, path, { method: "GET", signal: opts.signal });
    if (r.ok) {
      return r.value?.available === true
        ? { available: true }
        : { available: false, reason: "notConfigured", code: "NOT_AVAILABLE" };
    }
    if (r.code === "UNAUTHORIZED") return { available: false, reason: "signedOut", code: r.code };
    lastCode = r.code;
  }
  return { available: false, reason: "unreachable", code: lastCode };
}

/** What to show next. A transient failure never removes a feature that was already known to be ready. */
export function nextAvailability(prev: AvailabilityState, result: ProbeResult, keepReadyOnUnreachable = true): AvailabilityState {
  if (result.available) return { phase: "ready" };
  if (result.reason === "unreachable" && keepReadyOnUnreachable && prev.phase === "ready") return prev;
  return { phase: "unavailable", reason: result.reason, code: result.code };
}

export function initialAvailability(wasReady: boolean): AvailabilityState {
  return wasReady ? { phase: "ready" } : { phase: "checking" };
}

/** Remembers, per endpoint, that it answered "ready" recently. In-memory only: nothing is stored on the device. */
export function createReadyMemory(ttlMs: number = READY_MEMORY_TTL_MS, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return {
    wasReady(key: string): boolean {
      const at = seen.get(key);
      return at !== undefined && now() - at < ttlMs;
    },
    remember(key: string): void {
      seen.set(key, now());
    },
    forget(key: string): void {
      seen.delete(key);
    },
  };
}

export const readyMemory = createReadyMemory();

export type AvailabilityHintKey =
  | "attachUnavailable"
  | "attachUnreachable"
  | "voiceUnavailable"
  | "voiceUnreachable"
  | "featureSignedOut";

/** Copy for the disabled button's hint. Person-facing wording only: the technical reason is on /admin/features. */
export function availabilityHintKey(feature: "attach" | "voice", reason: AvailabilityReason): AvailabilityHintKey {
  if (reason === "signedOut") return "featureSignedOut";
  if (reason === "unreachable") return feature === "attach" ? "attachUnreachable" : "voiceUnreachable";
  return feature === "attach" ? "attachUnavailable" : "voiceUnavailable";
}
