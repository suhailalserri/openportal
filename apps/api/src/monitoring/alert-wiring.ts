/**
 * apps/api/src/monitoring/alert-wiring.ts (plan P2.2)
 * Connects the dependency-free signal seam (alert-hook.ts) to the detectors
 * (alert-rules.ts) and to an alert function. Called once from index.ts.
 */
import { setSignalHandlers } from "./alert-hook";
import { createCountWatch, createErrorRatioWatch } from "./alert-rules";

export function installAlertSignals(alert: (message: string, level: "warning" | "critical") => void): void {
  const providers = createErrorRatioWatch({
    onTrip: (provider, s) =>
      alert(
        `Provider "${provider}" is failing: ${s.errors} of ${s.total} upstream calls errored in the last 2 min ` +
          `(${Math.round(s.ratio * 100)}%). Check gateway channels; see docs/runbooks/provider-outage.md.`,
        "critical",
      ),
  });
  const deductions = createCountWatch({
    onTrip: (n) =>
      alert(
        `Credit deductions failing: ${n} failed deductions in 1 min. A few are normal races; a run means the ` +
          `pre-flight balance check is stale or bypassed. Check Sentry and the ledger.`,
        "critical",
      ),
  });
  setSignalHandlers({
    upstreamCall: (provider, ok) => providers.record(provider, ok),
    deductionFailure: () => deductions.record(),
  });
}
