"use client";

import * as Sentry from "@sentry/nextjs";
import * as React from "react";

import { isMonitoringEnabled } from "@/lib/monitoring/config";
import { reportError } from "@/lib/monitoring/report";

/**
 * apps/web/app/[locale]/dev/monitoring-test/monitoring-test-client.tsx
 *
 * Phase 9.2b. Each button maps to one check in "How to verify". Nothing
 * here needs a backend. Expected result per button is in the label.
 */
function RenderBomb(): React.ReactElement {
  throw new Error("Monitoring test: client render error (expected)");
}

export function MonitoringTestClient() {
  const [bomb, setBomb] = React.useState(false);
  const [clientReady, setClientReady] = React.useState<boolean | null>(null);
  const [diag, setDiag] = React.useState<string>("not run yet");
  React.useEffect(() => {
    setClientReady(Sentry.getClient() !== undefined);
  }, []);
  if (bomb) return <RenderBomb />;

  // Public by design (NEXT_PUBLIC_*): only the host is shown, never the key.
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const dsnOk = isMonitoringEnabled(dsn);
  let dsnHost = "";
  try {
    dsnHost = dsnOk && dsn ? new URL(dsn).host : "";
  } catch {
    dsnHost = "";
  }

  const btn = "rounded-md border border-border bg-card px-3 py-2 text-start text-sm";

  return (
    <main dir="ltr" className="mx-auto flex max-w-xl flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold">Monitoring test</h1>
      <p className="text-sm text-muted-foreground">
        With NEXT_PUBLIC_SENTRY_DSN set, buttons 1–3 create an event; button 4 must NOT.
      </p>

      <div className="rounded-md border border-border p-3 text-sm">
        <div>DSN in this build: {dsnOk ? `yes (${dsnHost})` : "NO"}</div>
        <div>
          Browser SDK initialised:{" "}
          {clientReady === null ? "…" : clientReady ? "yes" : "NO"}
        </div>
        <div className="break-all">Diagnostic result: {diag}</div>
      </div>

      <button
        type="button"
        className={btn}
        onClick={async () => {
          try {
            const id = Sentry.captureException(
              new Error("Monitoring test: diagnostic event (expected)")
            );
            const flushed = await Sentry.flush(4000);
            setDiag(`eventId=${id} flushed=${String(flushed)}`);
          } catch (e) {
            setDiag(`threw: ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      >
        0. Diagnostic: send event, show ID + flush result
      </button>

      <button
        type="button"
        className={btn}
        onClick={() => {
          setTimeout(() => {
            throw new Error("Monitoring test: uncaught handler error (expected)");
          }, 0);
        }}
      >
        1. Uncaught error in an event handler → event
      </button>

      <button
        type="button"
        className={btn}
        onClick={() =>
          reportError(new Error("Monitoring test: manual report (expected)"), {
            source: "monitoring-test",
          })
        }
      >
        2. Manual reportError → event tagged source=monitoring-test
      </button>

      <button type="button" className={btn} onClick={() => setBomb(true)}>
        3. Throw during render → global-error screen + event
      </button>

      <button
        type="button"
        className={btn}
        onClick={() =>
          reportError(Object.assign(new Error("aborted"), { name: "AbortError" }), {
            source: "monitoring-test",
          })
        }
      >
        4. AbortError (Stop button) → NO event
      </button>

      <a className="text-sm underline" href="?throw=server">
        5. Server render error (?throw=server) → event from onRequestError
      </a>
    </main>
  );
}
