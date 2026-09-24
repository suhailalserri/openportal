"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/monitoring/report";

/**
 * apps/web/app/global-error.tsx (Phase 9.2b)
 *
 * Last-resort boundary: renders only when the root layout itself throws
 * (next-intl, providers, fonts), and REPLACES the whole document — so it
 * must supply its own <html>/<body>, cannot use next-intl or the theme
 * providers, and the app's CSS is not loaded. Hence: inline styles, both
 * languages shown at once (the locale is unknown here), and
 * prefers-color-scheme for light/dark. No stack or message is rendered.
 *
 * Before 9.2b there was no global-error.tsx at all, so such a failure showed
 * Next's bare default page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: "global-error" });
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body>
        <style>{`
          :root { color-scheme: light dark; }
          body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
                 font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
                 background: #ffffff; color: #1a1a1a; }
          main { max-width: 22rem; padding: 2rem; text-align: center; }
          p { margin: 0 0 0.5rem; line-height: 1.6; }
          button { margin-top: 1rem; padding: 0.6rem 1.25rem; font: inherit; border-radius: 0.5rem;
                   border: 1px solid #98641a; background: #98641a; color: #ffffff; cursor: pointer; }
          @media (prefers-color-scheme: dark) {
            body { background: #111111; color: #f2f2f2; }
            button { background: #d9a441; border-color: #d9a441; color: #111111; }
          }
        `}</style>
        <main role="alert">
          <p dir="rtl" lang="ar">حدث خطأ غير متوقع. حاول مرة أخرى.</p>
          <p dir="ltr" lang="en">Something went wrong. Please try again.</p>
          <button type="button" onClick={reset}>
            <span lang="ar">إعادة المحاولة</span> / <span lang="en">Try again</span>
          </button>
        </main>
      </body>
    </html>
  );
}
