"use client";

import { useEffect, useId, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
}

/**
 * Cloudflare Turnstile, loaded via a plain script tag rather than an npm
 * package — none is in package.json, and the whole widget is ~15 lines
 * of window.turnstile calls, not worth adding a dependency for.
 *
 * Mirrors lib/turnstile-server.ts's own no-op behavior: when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set (local dev / a preview without
 * Cloudflare configured), this renders nothing and reports a placeholder
 * token once on mount, matching the server which skips verification when
 * TURNSTILE_SECRET_KEY is absent — so register works end-to-end in
 * environments that haven't configured Turnstile, exactly like the
 * server-side half already does.
 */
export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!siteKey) onToken("no-turnstile-configured");
  }, [siteKey, onToken]);

  if (!siteKey) return null;

  // `siteKey` itself is `string | undefined` at the declaration above;
  // the `if (!siteKey) return null` narrows it for the rest of THIS
  // function body, but not inside `renderWidget` below — a nested
  // function is a closure that could in principle be invoked later
  // (after further renders), so TypeScript can't carry a narrowing of
  // an outer `let`/param through it. Capturing it into a `const` here
  // does survive into the closure (a `const` can't be reassigned, so TS
  // treats its narrowed type as permanent) — confirmed by the third real
  // build, same underlying rule as the `noUncheckedIndexedAccess` fix in
  // register/page.tsx, different manifestation (closures vs. array
  // access) of "the compiler won't let outer control flow imply safety
  // inside a function that outlives it."
  const resolvedSiteKey: string = siteKey;

  function renderWidget() {
    if (rendered.current || !containerRef.current || !window.turnstile) return;
    rendered.current = true;
    window.turnstile.render(containerRef.current, {
      sitekey: resolvedSiteKey,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
  }

  return (
    <>
      {/* afterInteractive (not lazyOnload): the register form's submit
          button should be disabled until we have a token, so the widget
          needs to be ready close to when the page becomes interactive,
          not deferred until the browser is idle. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div id={containerId} ref={containerRef} />
    </>
  );
}
