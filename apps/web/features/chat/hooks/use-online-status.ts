"use client";

import * as React from "react";

/**
 * apps/web/features/chat/hooks/use-online-status.ts
 *
 * Phase 4b. `navigator.onLine` plus the `online`/`offline` window
 * events — good enough for "should I show a banner", not a claim about
 * actual reachability of the API (a captive portal with no internet
 * still reports `navigator.onLine === true`; `use-chat-stream.ts`'s own
 * network-drop → `partial` handling is what actually catches that case
 * mid-stream). This hook is purely the UI signal for `OfflineBanner`.
 *
 * No test file: `environment: "node"` (vitest.config.ts) has no
 * `window`/`navigator` without jsdom, which this sandbox has no way to
 * add (see that file's own header comment on the same constraint) — the
 * two DOM-free files this phase adds real logic to (the reducer,
 * stream-reader.ts) are the ones covered by chat-stream-reducer.test.ts
 * / stream-reader.test.ts instead.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  React.useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
