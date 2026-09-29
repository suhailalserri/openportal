/**
 * apps/api/src/monitoring/gateway-health.ts (plan P2.2)
 *
 * Backs GET /health/gateway, the synthetic gateway check for the external
 * uptime monitor. The gateway itself must NOT be public (N8), so the monitor
 * probes the api, and the api probes the gateway.
 *
 * "Up" = the gateway answered with any HTTP status < 500 within the timeout
 * (a 401 still proves it is alive; only network errors, timeouts and 5xx count
 * as down). Result cached briefly so a public endpoint cannot be used to
 * amplify traffic onto the gateway. No detail is returned to the caller.
 */
export interface GatewayProbeDeps {
  url: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cacheMs?: number;
}

export function createGatewayProbe(deps: GatewayProbeDeps) {
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchImpl ?? fetch;
  const cacheMs = deps.cacheMs ?? 30_000;
  let cached: { at: number; up: boolean } | null = null;
  let inflight: Promise<boolean> | null = null;

  async function probe(): Promise<boolean> {
    try {
      const res = await doFetch(deps.url, { method: "GET", signal: AbortSignal.timeout(deps.timeoutMs ?? 5_000) });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  return {
    async isUp(): Promise<boolean> {
      const t = now();
      if (cached && t - cached.at < cacheMs) return cached.up;
      inflight ??= probe().finally(() => { inflight = null; });
      const up = await inflight;
      cached = { at: now(), up };
      return up;
    },
  };
}
