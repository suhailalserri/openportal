"use client";

import * as React from "react";

import {
  initialAvailability, nextAvailability, probeAvailability, readyMemory, type AvailabilityState,
} from "../lib/availability";

/**
 * apps/web/features/chat/hooks/use-availability.ts
 *
 * P6.3e. Glue over lib/availability.ts: asks `path` (a status endpoint) whether a backend feature is ready,
 * retries transient failures, remembers a good answer across remounts, and lets the caller force a re-check
 * (the person taps the disabled button) or mark the feature unavailable (a later call said "not configured").
 * `strict` is for the admin readiness line: it ignores the memory and never hides a failure.
 */
export interface UseAvailabilityResult {
  state: AvailabilityState;
  recheck: () => void;
  markNotConfigured: () => void;
}

export function useAvailability(path: string, enabled: boolean, opts: { strict?: boolean } = {}): UseAvailabilityResult {
  const strict = opts.strict === true;
  const [state, setState] = React.useState<AvailabilityState>(() => initialAvailability(!strict && readyMemory.wasReady(path)));
  const [nonce, setNonce] = React.useState(0);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  React.useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    if (stateRef.current.phase === "unavailable") setState({ phase: "checking" });
    void probeAvailability(path, fetch, { signal: ctrl.signal }).then((result) => {
      if (ctrl.signal.aborted) return;
      if (result.available) readyMemory.remember(path);
      else if (result.reason !== "unreachable") readyMemory.forget(path);
      setState((prev) => nextAvailability(prev, result, !strict));
    });
    return () => ctrl.abort();
  }, [path, enabled, strict, nonce]);

  const recheck = React.useCallback(() => setNonce((n) => n + 1), []);
  const markNotConfigured = React.useCallback(() => {
    readyMemory.forget(path);
    setState({ phase: "unavailable", reason: "notConfigured", code: "NOT_CONFIGURED" });
  }, [path]);

  return { state, recheck, markNotConfigured };
}
