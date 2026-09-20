"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { requestPasswordReset } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/map-auth-error";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const forgotSchema = z.object({ email: z.string().min(1).email() });
type ForgotValues = z.infer<typeof forgotSchema>;

// No Suspense needed here (unlike login/register/verify): this page
// reads no search params.
export default function ForgotPasswordPage() {
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("forgotTitle")}</CardTitle>
        <CardDescription>{t("forgotMessage")}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-success" role="status">
            {t("resetSent")}
          </p>
        ) : (
          <>
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
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {t("sendResetLink")}
                </Button>
              </form>
            </Form>
          </>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href={`/${locale}/auth/login`} className="underline underline-offset-4">
            {t("backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
