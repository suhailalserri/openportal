"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { signUp } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/map-auth-error";
import { resolvePostLoginTarget } from "@/lib/safe-redirect";
import { checkPasswordRules, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { readReferralCode } from "@/lib/referral";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { LogoSpinner } from "@/components/auth/logo-spinner";
import { PasswordRuleRow } from "@/components/auth/password-rule-row";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

const registerSchema = z.object({
  email:           z.string().min(1).email(),
  displayName:     z.string().max(100).optional(),
  password:        z.string().min(1),
  confirmPassword: z.string().min(1),
  agreeToTerms:    z.boolean(),
});
type RegisterValues = z.infer<typeof registerSchema>;

/** See LoginForm's comment on `mode` and the Suspense boundary — same reasoning. */
export function RegisterForm({ mode = "page" }: { mode?: "page" | "modal" }) {
  return (
    <Suspense fallback={null}>
      <RegisterFormInner mode={mode} />
    </Suspense>
  );
}

function RegisterFormInner({ mode }: { mode: "page" | "modal" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Referral capture (decisions.md ADR-009) — the matching client side of
  // the `x-referral-code` header lib/auth.ts's databaseHooks reads.
  // A direct `?ref=` on THIS url wins; otherwise fall back to the code
  // captured earlier in the visit (see lib/referral.ts — landing-page
  // CTAs don't forward `ref` to /auth/register on their own).
  const referralCode = readReferralCode(searchParams.get("ref"));

  const [serverError, setServerError] = useState<string | null>(
    searchParams.get("error") ? t("errors.generic") : null
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", displayName: "", password: "", confirmPassword: "", agreeToTerms: false },
  });

  const password = form.watch("password");
  const passwordCheck = checkPasswordRules(password);

  async function onSubmit(values: RegisterValues) {
    setServerError(null);

    if (!values.agreeToTerms) {
      form.setError("agreeToTerms", { message: t("agreeToTerms") });
      return;
    }
    if (!passwordCheck.valid) {
      form.setError("password", { message: t("errors.weakPassword") });
      return;
    }
    if (values.password !== values.confirmPassword) {
      form.setError("confirmPassword", { message: t("errors.passwordMismatch") });
      return;
    }
    if (!turnstileToken) {
      setServerError(t("errors.captchaRequired"));
      return;
    }

    // x-turnstile-token / x-referral-code travel as headers, not body
    // fields — better-auth's sign-up schema doesn't accept arbitrary
    // extra fields (see lib/auth.ts's own comment on this). Could not
    // independently verify this second-argument `headers` shape against
    // better-auth's real client types in this environment (no
    // node_modules/network) — flagged in BRANCH_AND_CI_NOTES.md; if
    // wrong, this is the one call site to fix.
    //
    // `values.email.split("@")[0]` types as `string | undefined`, not
    // `string`, under this tsconfig's `noUncheckedIndexedAccess` (array
    // index access is never assumed in-bounds) — confirmed by the
    // second real build. `?? values.email` is the actual fallback that
    // guarantees a plain `string`; `values.email.split("@")[0]` can only
    // be undefined if `values.email` were empty, which zod's `.email()`
    // already rules out, so this never falls through to the full email
    // in practice — it exists to satisfy the type, not because the split
    // is expected to fail.
    const emailLocalPart = values.email.split("@")[0] ?? values.email;

    const { error } = await signUp.email(
      {
        email: values.email,
        password: values.password,
        name: values.displayName || emailLocalPart,
      },
      {
        headers: {
          "x-turnstile-token": turnstileToken,
          ...(referralCode ? { "x-referral-code": referralCode } : {}),
        },
      }
    );

    if (error) {
      // "USER_ALREADY_EXISTS" is better-auth's documented code for a
      // duplicate email/password sign-up — not independently confirmed
      // against this pinned version's actual error shape in this
      // environment (no node_modules/network); if it doesn't match,
      // this falls through to mapAuthError's generic bucket instead of
      // the more specific "this email is already registered" copy, not
      // a broken flow.
      setServerError(error.code === "USER_ALREADY_EXISTS" ? t("errors.emailTaken") : mapAuthError(error, t));
      return;
    }

    setSubmitted(true);
    router.push(`/${locale}/auth/verify?email=${encodeURIComponent(values.email)}`);
  }

  if (submitted) return null; // navigating away to /auth/verify

  return (
    <AuthShell locale={locale} activeTab="signup" mode={mode}>
      <h2 className="auth-title" id="authTitle">{t("createAccountTitle")}</h2>
      <p className="auth-subtitle">{t("registerSubtitle")}</p>

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
              name="displayName"
              render={({ field }) => (
                <FormItem className="auth-field">
                  <label htmlFor={field.name} className="auth-label">{t("displayName")}</label>
                  <FormControl>
                    <Input
                      id={field.name}
                      autoComplete="name"
                      placeholder="Ahmed"
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
                  <FormControl>
                    <PasswordInput
                      id={field.name}
                      autoComplete="new-password"
                      placeholder={t("passwordRules.minLength")}
                      className="auth-input auth-input--with-icon"
                      {...field}
                    />
                  </FormControl>
                  {/* Live checklist mirroring the server's rules (lib/auth.ts,
                      frozen) — see lib/password-rules.ts for why this is a
                      hand-mirrored copy rather than a shared import. */}
                  <ul className="grid gap-1 text-xs">
                    <PasswordRuleRow
                      ok={password.length >= PASSWORD_MIN_LENGTH}
                      label={t("passwordRules.minLength")}
                    />
                    <PasswordRuleRow ok={/[A-Z]/.test(password)} label={t("passwordRules.uppercase")} />
                    <PasswordRuleRow ok={/[0-9]/.test(password)} label={t("passwordRules.digit")} />
                  </ul>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem className="auth-field">
                  <label htmlFor={field.name} className="auth-label">{t("confirmPassword")}</label>
                  <FormControl>
                    <PasswordInput
                      id={field.name}
                      autoComplete="new-password"
                      className="auth-input auth-input--with-icon"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="agreeToTerms"
              render={({ field }) => (
                <FormItem>
                  <label className="auth-check" style={{ alignItems: "flex-start", fontSize: "0.78rem", lineHeight: 1.5 }}>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span className="auth-check-box" style={{ marginTop: 2 }} />
                    <span>
                      {/* stopPropagation: both links sit inside the native
                          <label> that toggles the checkbox (no htmlFor/id
                          pairing — an implicit label), so without this a
                          click on "Terms of Service" would also silently
                          check the box. Reading the terms must never itself
                          grant consent to them. preventDefault is NOT
                          called, so the link's own navigation still fires
                          normally. */}
                      {t.rich("agreeToTerms", {
                        terms: (chunks) => (
                          <Link
                            href={`/${locale}/legal/terms`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="auth-link"
                          >
                            {chunks}
                          </Link>
                        ),
                        privacy: (chunks) => (
                          <Link
                            href={`/${locale}/legal/privacy`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="auth-link"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </span>
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />

            <TurnstileWidget onToken={setTurnstileToken} />
          </div>

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            aria-busy={form.formState.isSubmitting}
            className="auth-submit-btn h-12 w-full rounded-xl text-[0.92rem]"
          >
            {form.formState.isSubmitting ? <LogoSpinner variant="signup" /> : t("registerButton")}
          </Button>
        </form>
      </Form>
      <GoogleSignIn
        callbackURL={resolvePostLoginTarget(null, locale)}
        errorCallbackURL={`/${locale}/auth/register?error=oauth`}
        referralCode={referralCode}
        onError={setServerError}
      />
      {process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "true" ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {t.rich("googleTermsNotice", {
            terms: (chunks) => (
              <Link
                href={`/${locale}/legal/terms`}
                target="_blank"
                rel="noopener noreferrer"
                className="auth-link"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href={`/${locale}/legal/privacy`}
                target="_blank"
                rel="noopener noreferrer"
                className="auth-link"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      <p className="auth-legal">
        {t("haveAccount")}{" "}
        <Link href={`/${locale}/auth/login`}>{t("login")}</Link>
      </p>
    </AuthShell>
  );
}
