"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";

import { sendVerificationEmail } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/map-auth-error";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RESEND_COOLDOWN_SECONDS = 60;

/** Suspense: useSearchParams() reads `?email=` — see the same note on login/page.tsx. */
export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
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
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <MailCheck aria-hidden="true" className="mb-2 size-10 text-primary" />
        <CardTitle>{t("verifyEmail")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-center">
        <p className="text-sm text-muted-foreground">{t("verifyMessage", { email })}</p>
        {error ? <FormErrorBanner message={error} /> : null}
        {justSent && !error ? <p className="text-sm text-success">{t("verificationSent")}</p> : null}
        <Button variant="outline" onClick={onResend} disabled={cooldown > 0 || !email}>
          {cooldown > 0 ? t("verifyResendIn", { seconds: cooldown }) : t("resendVerification")}
        </Button>
        <Link href={`/${locale}/auth/login`} className="text-sm text-muted-foreground underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </CardContent>
    </Card>
  );
}
