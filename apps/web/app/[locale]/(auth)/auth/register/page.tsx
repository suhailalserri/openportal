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
import { checkPasswordRules, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { PasswordRuleRow } from "@/components/auth/password-rule-row";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const registerSchema = z.object({
  email:           z.string().min(1).email(),
  displayName:     z.string().max(100).optional(),
  password:        z.string().min(1),
  confirmPassword: z.string().min(1),
  agreeToTerms:    z.boolean(),
});
type RegisterValues = z.infer<typeof registerSchema>;

/** Suspense: useSearchParams() reads `?ref=` — see the same note on login/page.tsx. */
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Referral capture (decisions.md ADR-009) — the matching client side of
  // the `x-referral-code` header lib/auth.ts's databaseHooks reads.
  // Trimmed/uppercased server-side already; sent as-is here.
  const referralCode = searchParams.get("ref");

  const [serverError, setServerError] = useState<string | null>(null);
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("register")}</CardTitle>
      </CardHeader>
      <CardContent>
        {serverError ? <FormErrorBanner message={serverError} className="mb-4" /> : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("email")}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("displayName")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("password")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
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
                <FormItem>
                  <FormLabel>{t("confirmPassword")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
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
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span>{t("agreeToTerms")}</span>
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />

            <TurnstileWidget onToken={setTurnstileToken} />

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t("registerButton")}
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href={`/${locale}/auth/login`} className="text-foreground underline underline-offset-4">
            {t("login")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
