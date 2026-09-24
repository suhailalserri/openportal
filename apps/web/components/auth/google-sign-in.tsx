"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { signIn } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/map-auth-error";
import { Button } from "@/components/ui/button";

/**
 * "Continue with Google" — shared by the login and register pages (Google
 * has no separate sign-up call: better-auth creates the account on first
 * sign-in, which is why both pages use this same component).
 *
 * Rendered only when NEXT_PUBLIC_GOOGLE_SIGNIN === "true" (inlined at build
 * time, like every NEXT_PUBLIC_* value). That lets this code ship before the
 * Google Cloud client exists, and lets Preview builds — where Google can't
 * work, because it requires exact redirect URIs — stay button-free.
 *
 * Google skips the Turnstile check and the terms checkbox that email sign-up
 * has, so the register page shows a terms notice next to this button.
 */
export function GoogleSignIn({
  callbackURL,
  errorCallbackURL,
  onError,
  referralCode,
}: {
  /** Where to land after success. Must already be a sanitized in-app path. */
  callbackURL: string;
  /** Where better-auth sends the user if the Google flow fails. */
  errorCallbackURL: string;
  onError?: (message: string) => void;
  /**
   * `?ref=` code from the register page. Stored in a 30-minute cookie so the
   * OAuth callback (which can't carry custom headers) can still attribute the
   * new account — see readReferralCookie() in lib/auth.ts.
   */
  referralCode?: string | null | undefined;
}) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);

  // Pressing Back from Google's page can restore this page from the browser's
  // back/forward cache with `pending` still true (a permanent spinner).
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  if (process.env.NEXT_PUBLIC_GOOGLE_SIGNIN !== "true") return null;

  async function onClick() {
    setPending(true);
    if (referralCode && /^[A-Za-z0-9]{4,12}$/.test(referralCode)) {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `ref_code=${encodeURIComponent(referralCode.toUpperCase())}; path=/; max-age=1800; SameSite=Lax${secure}`;
    }
    // On success the browser is redirected to Google, so there is nothing
    // to do afterwards; `pending` only matters for the failure path.
    const { error } = await signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: callbackURL,
      errorCallbackURL,
    });
    if (error) {
      onError?.(mapAuthError(error, t));
      setPending(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("orContinueWith")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
        )}
        Google
      </Button>
    </div>
  );
}
