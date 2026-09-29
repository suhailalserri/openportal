/**
 * apps/api/src/monitoring/alert-hook.ts (plan P2.2)
 *
 * Dependency-free seam between "a business signal happened" (an upstream call
 * finished, a credit deduction failed) and "decide whether that is an alert".
 * Same pattern as error-hook.ts and for the same reason: `services/*` are also
 * bundled into apps/web, so they must not import Redis/BullMQ/config. They call
 * these functions; only index.ts installs handlers.
 *
 * Contract (L12): never throws, never awaits. No handlers => no-op.
 */
export interface SignalHandlers {
  upstreamCall?: (provider: string, ok: boolean) => void;
  deductionFailure?: () => void;
}

let handlers: SignalHandlers | null = null;

export function setSignalHandlers(next: SignalHandlers | null): void {
  handlers = next;
}

export function signalUpstreamCall(provider: string, ok: boolean): void {
  try { handlers?.upstreamCall?.(provider, ok); } catch { /* best-effort */ }
}

export function signalDeductionFailure(): void {
  try { handlers?.deductionFailure?.(); } catch { /* best-effort */ }
}
