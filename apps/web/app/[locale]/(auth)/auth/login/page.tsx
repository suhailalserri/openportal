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
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const credentialsSchema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1),
});
type CredentialsValues = z.infer<typeof credentialsSchema>;

/**
 * Page component itself stays a thin Suspense wrapper: useSearchParams()
 * (needed to read `?next=`, set by decideAppGuard/decideAdminGuard when
 * they bounce a signed-out visitor here) requires one per Next's app-
 * router rules for a route that could otherwise be statically optimized.
 * The (auth)/auth/layout.tsx parent already forces this segment dynamic
 * (it calls getServerSession(), which calls headers()), so this Suspense
 * boundary never actually shows its fallback in practice — it satisfies
 * the build-time requirement, not a real loading state.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [totpMode, setTotpMode] = useState<"code" | "backup">("code");
  const [serverError, setServerError] = useState<string | null>(null);
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
    if (data?.twoFactorRedirect) {
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("totpTitle")}</CardTitle>
          <CardDescription>{t("totpMessage")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {serverError ? <FormErrorBanner message={serverError} /> : null}
          <div className="grid gap-2">
            <label htmlFor="totp-code" className="text-sm font-medium">
              {totpMode === "code" ? t("totpCode") : t("backupCode")}
            </label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpValue}
              onChange={(e) => setTotpValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmitTotp()}
            />
          </div>
          <Button onClick={onSubmitTotp} disabled={totpSubmitting || totpValue.length === 0}>
            {t("verifyButton")}
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setTotpMode((m) => (m === "code" ? "backup" : "code"));
              setTotpValue("");
              setServerError(null);
            }}
          >
            {totpMode === "code" ? t("useBackupCode") : t("useAuthenticatorApp")}
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("login")}</CardTitle>
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("password")}</FormLabel>
                    <Link
                      href={`/${locale}/auth/forgot`}
                      className="text-sm text-muted-foreground underline underline-offset-4"
                    >
                      {t("forgotPassword")}
                    </Link>
                  </div>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t("loginButton")}
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href={`/${locale}/auth/register`} className="text-foreground underline underline-offset-4">
            {t("register")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

