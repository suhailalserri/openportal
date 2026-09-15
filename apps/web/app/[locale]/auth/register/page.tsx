"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { signUp } from "@/lib/auth-client";
import { toast } from "sonner";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { getStoredReferralCode } from "@/components/referral/ReferralCapture";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const t      = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [form, setForm] = useState({ email: "", password: "", confirm: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Bumped after every failed/consumed attempt to force the widget to
  // remount and issue a fresh token — Turnstile tokens are single-use.
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const captchaConfigured = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error(t("auth.errors.passwordMismatch")); return;
    }
    if (captchaConfigured && !turnstileToken) {
      toast.error(t("auth.errors.captchaRequired")); return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (turnstileToken) headers["x-turnstile-token"] = turnstileToken;
      const referralCode = getStoredReferralCode();
      if (referralCode) headers["x-referral-code"] = referralCode;

      const result = await signUp.email(
        {
          email:    form.email,
          password: form.password,
          name:     form.name,
        },
        Object.keys(headers).length > 0 ? { headers } : {}
      );
      if (result.error) {
        console.error("Sign-up failed:", result.error);
        const code = (result.error as { code?: string }).code;
        const msg =
          code === "CAPTCHA_FAILED"
            ? t("auth.errors.captchaFailed")
            : code === "WEAK_PASSWORD"
              // This is the Arabic message thrown by lib/auth.ts's
              // hooks.before password-strength check (uppercase + digit
              // requirement) — surface it directly instead of the
              // generic fallback below, or the user never learns why
              // their password was rejected.
              ? (result.error.message ?? t("auth.errors.generic"))
              : result.error.message?.includes("already")
                ? t("auth.errors.emailTaken")
                : t("auth.errors.generic");
        toast.error(msg);
        // The consumed/rejected token can't be reused — force a fresh
        // challenge before the next attempt.
        setTurnstileToken(null);
        setTurnstileResetKey((k) => k + 1);
        return;
      }
      router.push(`/${locale}/auth/verify?email=${encodeURIComponent(form.email)}`);
    } catch {
      toast.error(t("errors.generic"));
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  const strength = form.password.length === 0 ? null
    : form.password.length < 6 ? "weak"
    : /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) ? "strong"
    : "medium";

  const strengthColors = { weak: "bg-red-500", medium: "bg-amber-500", strong: "bg-emerald-500" };
  const strengthText   = { weak: "text-red-400", medium: "text-amber-400", strong: "text-emerald-400" };
  const strengthWidth  = { weak: "w-1/3", medium: "w-2/3", strong: "w-full" };
  const strengthLabels = {
    weak:   t("auth.passwordStrength.weak"),
    medium: t("auth.passwordStrength.medium"),
    strong: t("auth.passwordStrength.strong"),
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl gradient-primary
                          shadow-[var(--shadow-elevation-2)] mb-4">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {locale === "ar" ? "منصة الذكاء" : "AI Platform"}
          </h1>
        </div>

        <Card className="p-8 shadow-[var(--shadow-elevation-3)]">
          <h2 className="text-xl font-semibold text-white mb-6">{t("auth.register")}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              name="name" type="text" value={form.name} onChange={handleChange}
              label={<>{t("auth.displayName")} <span className="text-slate-500">({t("common.optional")})</span></>}
            />

            <Input
              name="email" type="email" required dir="ltr" value={form.email} onChange={handleChange}
              label={t("auth.email")}
              placeholder="you@example.com"
            />

            <div>
              <Input
                name="password" type="password" required dir="ltr" value={form.password} onChange={handleChange}
                label={t("auth.password")}
                placeholder="••••••••"
              />
              {strength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-slate-700 rounded overflow-hidden">
                    <div className={cn("h-1 rounded transition-all", strengthColors[strength], strengthWidth[strength])} />
                  </div>
                  <span className={cn("text-xs shrink-0", strengthText[strength])}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </div>

            <Input
              name="confirm" type="password" required dir="ltr" value={form.confirm} onChange={handleChange}
              label={t("auth.confirmPassword")}
              placeholder="••••••••"
              error={form.confirm && form.confirm !== form.password ? t("auth.errors.passwordMismatch") : undefined}
            />

            <TurnstileWidget
              locale={locale}
              resetKey={turnstileResetKey}
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={loading || (captchaConfigured && !turnstileToken)}
            >
              {t("auth.registerButton")}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {t("auth.haveAccount")}{" "}
            <Link href={`/${locale}/auth/login`}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              {t("auth.loginButton")}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
