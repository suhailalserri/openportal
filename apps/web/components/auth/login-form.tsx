"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { signIn, twoFactor } from "@/lib/auth-client";
import { resolvePostLoginTarget } from "@/lib/safe-redirect";
import { mapAuthError } from "@/lib/map-auth-error";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { LogoSpinner } from "@/components/auth/logo-spinner";
import { PasskeySignIn } from "@/components/auth/passkey-sign-in";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

const credentialsSchema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1),
});
type CredentialsValues = z.infer<typeof credentialsSchema>;

/**
 * `mode="page"` (default) is the direct-route fallback (deep link / hard
 * refresh of /auth/login). `mode="modal"` is used by the @modal-slot
 * interceptor so this exact same form renders on top of whatever page
 * the visitor was on — see AuthShell's own comment for what `mode`
 * changes. Either way `useSearchParams()` (for `?next=` / `?error=`)
 * needs its own Suspense boundary per Next's app-router rules, so it's
 * wrapped here once rather than duplicated at both call sites.
 */
export function LoginForm({ mode = "page" }: { mode?: "page" | "modal" }) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner mode={mode} />
    </Suspense>
  );
}

function LoginFormInner({ mode }: { mode: "page" | "modal" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [totpMode, setTotpMode] = useState<"code" | "backup">("code");
  // `?error=` is where better-auth sends a failed/cancelled Google flow
  // (see errorCallbackURL below) — show the generic message for it.
  const [serverError, setServerError] = useState<string | null>(
    searchParams.get("error") ? t("errors.generic") : null
  );
  const [totpSubmitting, setTotpSubmitting] = useState(false);
  const [totpValue, setTotpValue] = useState("");

  const form = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: CredentialsValues) {
    setServerError(null);
    const { data, error } = await signIn.email({ email: values.email, password: values.password });

    if (error) {
      setServerError(mapAuthError(error, t));
      return;
    }

    // better-auth: when the account has 2FA enabled, `data` is
    // `{ twoFactorRedirect: true }` instead of a session — see the
    // comment on this exact branch in lib/auth-client.ts (frozen), which
    // specifies checking `data?.twoFactorRedirect` directly.
    //
    // Cast through `unknown` rather than reading the property straight
    // off `data`: the first real build showed the inferred success type
    // is `Omit<{ redirect, token, ... }>` with no `twoFactorRedirect`
    // branch, so TypeScript won't allow reading it even optionally —
    // `"x" in data` narrowing only discriminates between branches a
    // union already has, it can't add a property absent from every
    // branch. This does not change the runtime check, only satisfies
    // the type checker; the frozen file's comment is the actual source
    // of truth for the runtime shape better-auth returns.
    const twoFactorRedirect = (data as unknown as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect;
    if (twoFactorRedirect) {
      setStep("totp");
      return;
    }

    finishLogin();
  }

  async function onSubmitTotp() {
    setServerError(null);
    setTotpSubmitting(true);
    try {
      const { error } =
        totpMode === "code"
          ? await twoFactor.verifyTotp({ code: totpValue })
          : await twoFactor.verifyBackupCode({ code: totpValue });

      if (error) {
        setServerError(mapAuthError(error, t));
        return;
      }
      finishLogin();
    } finally {
      setTotpSubmitting(false);
    }
  }

  function finishLogin() {
    router.push(resolvePostLoginTarget(next, locale));
    router.refresh();
  }

  if (step === "totp") {
    return (
      <AuthShell locale={locale} activeTab="signin" hideTabs mode={mode}>
        <h2 className="auth-title" id="authTitle">{t("totpTitle")}</h2>
        <p className="auth-subtitle">{t("totpMessage")}</p>

        {serverError ? <FormErrorBanner message={serverError} className="mb-4" /> : null}
        <div className="auth-fields">
          <div className="auth-field">
            <label htmlFor="totp-code" className="auth-label">
              {totpMode === "code" ? t("totpCode") : t("backupCode")}
            </label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="auth-input"
              value={totpValue}
              onChange={(e) => setTotpValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmitTotp()}
            />
          </div>
          <Button
            onClick={onSubmitTotp}
            disabled={totpSubmitting || totpValue.length === 0}
            className="auth-submit-btn h-12 w-full rounded-xl text-[0.92rem]"
          >
            {totpSubmitting ? <LogoSpinner variant="signin" /> : t("verifyButton")}
          </Button>
          <button
            type="button"
            className="auth-link text-center text-sm"
            onClick={() => {
              setTotpMode((m) => (m === "code" ? "backup" : "code"));
              setTotpValue("");
              setServerError(null);
            }}
          >
            {totpMode === "code" ? t("useBackupCode") : t("useAuthenticatorApp")}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell locale={locale} activeTab="signin" mode={mode}>
      <h2 className="auth-title" id="authTitle">{t("welcomeBack")}</h2>
      <p className="auth-subtitle">{t("loginSubtitle")}</p>

      {serverError ? <FormErrorBanner message={serverError} className="mb-4" /> : null}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="auth-fields">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="auth-field">
                  <label htmlFor={field.name} className="auth-label">{t("email")}</label>
                  <FormControl>
                    <Input
                      id={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="auth-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="auth-field">
                  <label htmlFor={field.name} className="auth-label">{t("password")}</label>
                  <div className="auth-input-wrap">
                    <PasswordInput
                      id={field.name}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="auth-input auth-input--with-icon"
                      {...field}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="auth-row">
            <span />
            <Link href={`/${locale}/auth/forgot`} className="auth-link">
              {t("forgotPassword")}
            </Link>
          </div>

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            aria-busy={form.formState.isSubmitting}
            className="auth-submit-btn h-12 w-full rounded-xl text-[0.92rem]"
          >
            {form.formState.isSubmitting ? <LogoSpinner variant="signin" /> : t("loginButton")}
          </Button>
        </form>
      </Form>
      <PasskeySignIn onSuccess={finishLogin} onError={setServerError} />
      <GoogleSignIn
        callbackURL={resolvePostLoginTarget(next, locale)}
        errorCallbackURL={`/${locale}/auth/login?error=oauth`}
        onError={setServerError}
      />
      <p className="auth-legal">
        {t("noAccount")}{" "}
        <Link href={`/${locale}/auth/register`}>{t("register")}</Link>
      </p>
    </AuthShell>
  );
}
