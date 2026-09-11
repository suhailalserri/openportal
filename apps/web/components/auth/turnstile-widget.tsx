"use client";
import { useEffect, useRef, useState } from "react";

// Minimal typing for the bits of the global `turnstile` object we use —
// the full types ship with @cloudflare/turnstile-types, which isn't a
// dependency here to avoid adding a package for a handful of methods.
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  locale?: string;
  /**
   * Bump this to force the widget to remount and re-issue a fresh
   * challenge — Turnstile tokens are single-use, so this must happen
   * after every failed submission that consumed the previous token.
   */
  resetKey?: string | number;
}

/**
 * Renders nothing (and blocks nothing) when NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * isn't set, so local dev without a Cloudflare account still works. Once
 * the site key is configured, this is real friction — don't render it on
 * forms you don't intend to gate.
 */
export function TurnstileWidget({ onVerify, onExpire, locale, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    setError(false);

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          language: locale === "ar" ? "ar" : "en",
          callback: (token: string) => onVerify(token),
          "expired-callback": () => onExpire?.(),
          "error-callback": () => setError(true),
        });
      })
      .catch(() => setError(true));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
    // resetKey deliberately forces a full remount (new widget instance,
    // fresh token) rather than calling .reset() — simpler than threading
    // an imperative handle up to the parent form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, resetKey]);

  if (!siteKey) return null;

  return (
    <div>
      <div ref={containerRef} />
      {error && (
        <p className="mt-1 text-xs text-red-400">
          {locale === "ar"
            ? "تعذر تحميل التحقق الأمني. أعد تحميل الصفحة."
            : "Couldn't load verification. Please reload the page."}
        </p>
      )}
    </div>
  );
}
