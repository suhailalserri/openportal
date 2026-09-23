"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { changePassword } from "@/lib/auth-client";
import { checkPasswordRules, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { PasswordRuleRow } from "@/components/auth/password-rule-row";
import { useFormDirtyGuard } from "../../hooks/use-form-dirty-guard";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "MISMATCH",
  });
type Values = z.infer<typeof schema>;

/**
 * apps/web/features/settings/sections/security/change-password-form.tsx (Phase 7.1)
 *
 * Calls `authClient.changePassword()` directly (not a tRPC procedure) —
 * `user.router.ts`'s own comment explains why: apps/api reads the
 * `sessions` table directly and has no access to the better-auth server
 * instance that lives in apps/web, so it can never correctly verify/
 * rewrite a credential.
 *
 * `checkPasswordRules` (same helper `register/page.tsx` uses) mirrors
 * the server's rules client-side purely for immediate feedback — the
 * server (lib/auth.ts, frozen) remains authoritative; a mismatch here
 * only means a confusing round-trip, not a security gap.
 */
export function ChangePasswordForm() {
  const t = useTranslations("settings.security.password");
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useFormDirtyGuard(form.formState.isDirty);

  const newPassword = form.watch("newPassword");
  const passwordCheck = checkPasswordRules(newPassword);

  async function onSubmit(values: Values) {
    setServerError(null);
    setSuccess(false);

    if (!passwordCheck.valid) {
      form.setError("newPassword", { message: "WEAK" });
      return;
    }

    const { error } = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: false,
    });

    if (error) {
      setServerError(
        error.status === 401 || error.status === 400 ? t("errors.incorrectCurrent") : t("errors.generic")
      );
      return;
    }

    setSuccess(true);
    form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            {serverError && <FormErrorBanner message={serverError} />}

            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("current")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("new")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <PasswordRuleRow ok={newPassword.length >= PASSWORD_MIN_LENGTH} label={t("rules.minLength", { count: PASSWORD_MIN_LENGTH })} />
                    <PasswordRuleRow ok={!passwordCheck.failedRules.includes("uppercase")} label={t("rules.uppercase")} />
                    <PasswordRuleRow ok={!passwordCheck.failedRules.includes("digit")} label={t("rules.digit")} />
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
                  <FormLabel>{t("confirm")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{t("errors.mismatch")}</p>
                  )}
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between">
              {success && <p className="text-xs text-success">{t("success")}</p>}
              <Button type="submit" className="ms-auto" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("saving") : t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
