"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { requestPasswordReset } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/map-auth-error";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { LogoSpinner } from "@/components/auth/logo-spinner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const forgotSchema = z.object({ email: z.string().min(1).email() });
type ForgotValues = z.infer<typeof forgotSchema>;

/**
 * `mode` mirrors LoginForm/RegisterForm: `"page"` is the direct-route
 * fallback (deep link / hard refresh of /auth/forgot), `"modal"` is used
 * by the @modal-slot interceptor so "Forgot password?" (a link inside
 * the login modal) opens this on top of the same overlay stack instead
 * of dropping the visitor into a full-page reload mid-flow.
 *
 * No `useSearchParams()` here (unlike login/register/verify), so unlike
 * those this needs no Suspense boundary of its own.
 */
export function ForgotPasswordForm({ mode = "page" }: { mode?: "page" | "modal" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotValues) {
    setServerError(null);
    const { error } = await requestPasswordReset({
      email: values.email,
      redirectTo: `/${locale}/auth/reset`,
    });
    if (error) {
      setServerError(mapAuthError(error, t));
      return;
    }
    // Deliberately shown regardless of whether the email exists — this
    // is the standard mitigation against using "reset sent" as an email
    // enumeration oracle. better-auth's requestPasswordReset itself
    // returns success either way on the pinned version's default
    // behavior; not independently confirmed against its real
    // implementation in this environment (no node_modules/network).
    setSent(true);
  }

  return (
    <AuthShell locale={locale} hideTabs mode={mode}>
      <h2 className="auth-title" id="authTitle">{t("forgotTitle")}</h2>
      <p className="auth-subtitle">{t("forgotMessage")}</p>

      {sent ? (
        <p className="text-sm text-success" role="status">
          {t("resetSent")}
        </p>
      ) : (
        <>
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
              </div>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                aria-busy={form.formState.isSubmitting}
                className="auth-submit-btn h-12 w-full rounded-xl text-[0.92rem]"
              >
                {form.formState.isSubmitting ? <LogoSpinner variant="signin" /> : t("sendResetLink")}
              </Button>
            </form>
          </Form>
        </>
      )}
      <p className="auth-legal">
        <Link href={`/${locale}/auth/login`}>{t("backToLogin")}</Link>
      </p>
    </AuthShell>
  );
}
