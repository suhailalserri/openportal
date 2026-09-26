"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";

import { sendVerificationEmail } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/map-auth-error";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { Button } from "@/components/ui/button";

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * `mode` mirrors LoginForm/RegisterForm/ForgotPasswordForm: `"page"` is
 * the direct-route fallback (deep link / hard refresh of /auth/verify),
 * `"modal"` is used by the @modal-slot interceptor so the post-register
 * `router.push(/auth/verify)` in RegisterForm opens this on top of the
 * same overlay stack instead of dropping the visitor into a full-page
 * reload right after signing up.
 *
 * Suspense: useSearchParams() reads `?email=` — see the same note on
 * login/register's own Suspense wrapper.
 */
export function VerifyForm({ mode = "page" }: { mode?: "page" | "modal" }) {
  return (
    <Suspense fallback={null}>
      <VerifyFormInner mode={mode} />
    </Suspense>
  );
}

function VerifyFormInner({ mode }: { mode: "page" | "modal" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function onResend() {
    setError(null);
    setJustSent(false);
    // The actual verification link (better-auth's own /api/auth/verify-email
    // GET route) is what marks the account verified — see lib/auth.ts's
    // afterEmailVerification hook. This page never calls a "verify" client
    // method itself, only re-sends the link.
    const { error: err } = await sendVerificationEmail({
      email,
      callbackURL: `/${locale}/chat`,
    });
    if (err) {
      setError(mapAuthError(err, t));
      return;
    }
    setJustSent(true);
    startCooldown();
  }

  return (
    <AuthShell locale={locale} hideTabs mode={mode}>
      <div className="flex flex-col items-center text-center">
        <MailCheck aria-hidden="true" className="mb-3 size-10 text-primary" />
        <h2 className="auth-title" id="authTitle">{t("verifyEmail")}</h2>
        <p className="auth-subtitle">{t("verifyMessage", { email })}</p>
      </div>
      <div className="grid gap-4 text-center">
        {error ? <FormErrorBanner message={error} /> : null}
        {justSent && !error ? <p className="text-sm text-success">{t("verificationSent")}</p> : null}
        <Button variant="outline" onClick={onResend} disabled={cooldown > 0 || !email} className="h-12 rounded-xl">
          {cooldown > 0 ? t("verifyResendIn", { seconds: cooldown }) : t("resendVerification")}
        </Button>
        <Link href={`/${locale}/auth/login`} className="text-sm text-muted-foreground underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </div>
    </AuthShell>
  );
}
