"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { resolveDeleteAccountFailure, type DeleteAccountErrorCode } from "./delete-account-logic";

type ErrorCode = DeleteAccountErrorCode;

/**
 * apps/web/features/settings/sections/data-privacy/delete-account-dialog.tsx (Phase 7.2)
 *
 * Talks to `POST /api/user/delete-account` directly (a REST route, not
 * tRPC — same reasoning as `active-sessions-list.tsx` reusing the
 * `/api/user/sessions*` wrappers rather than a client-only better-auth
 * call), extended this session to also send `twoFactorCode`.
 *
 * Only ever shows the password field: `user.getProfile` doesn't expose
 * whether the account is credential- vs OAuth-based, and — more to the
 * point — `lib/auth.ts`'s `emailAndPassword` config with no
 * `socialProviders` entries anywhere in this codebase means every real
 * account here IS a credential account today. The route's OAuth/
 * `confirmed`-flag branch stays as a server-side safety net (unchanged,
 * untouched) but has no reachable UI path yet; wiring a "type DELETE to
 * confirm" step for it is one small addition whenever a social provider
 * actually ships.
 *
 * Step order mirrors the server's own check order (password, then 2FA)
 * so a wrong password is reported before asking for a 2FA code that
 * would otherwise be checked first for nothing.
 */
type Step = "closed" | "password" | "twoFactor";

export function DeleteAccountDialog() {
  const t = useTranslations("settings.data.deleteDialog");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>("closed");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  function reset() {
    setStep("closed");
    setPassword("");
    setCode("");
    setError(null);
  }

  async function submit(body: { password: string; twoFactorCode?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        const errorCode = (data.error ?? "GENERIC") as ErrorCode;
        // step is "closed" only before the dialog opens, never here.
        const { nextStep, error: nextError } = resolveDeleteAccountFailure(
          step === "closed" ? "password" : step,
          errorCode,
        );
        setStep(nextStep);
        setError(nextError);
        return;
      }
      await authClient.signOut();
      router.push(`/${locale}/auth/login`);
    } catch {
      setError("GENERIC");
    } finally {
      setBusy(false);
    }
  }

  function submitPassword() {
    void submit({ password });
  }

  function submitCode() {
    void submit({ password, twoFactorCode: code });
  }

  const errorMessage = error
    ? error === "INCORRECT_PASSWORD" ? t("errors.incorrectPassword")
    : error === "INVALID_TWO_FACTOR_CODE" ? t("errors.invalidCode")
    : error === "TOO_MANY_ATTEMPTS" ? t("errors.tooMany")
    : t("errors.generic")
    : null;

  return (
    <>
      <Button type="button" variant="destructive" size="sm" className="w-fit" onClick={() => setStep("password")}>
        {t("trigger")}
      </Button>

      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && reset()}>
        <DialogContent>
          {step === "password" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("title")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("description")}</p>
              {errorMessage && <FormErrorBanner message={errorMessage} />}
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-password">{t("passwordLabel")}</Label>
                <Input
                  id="delete-password" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="destructive" disabled={!password || busy} onClick={submitPassword}>
                  {busy ? t("checking") : t("continue")}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "twoFactor" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("twoFactorTitle")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("twoFactorDescription")}</p>
              {errorMessage && <FormErrorBanner message={errorMessage} />}
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-2fa">{t("codeLabel")}</Label>
                <Input
                  id="delete-2fa" inputMode="numeric" autoComplete="one-time-code"
                  value={code} onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="destructive" disabled={!code || busy} onClick={submitCode}>
                  {busy ? t("checking") : t("confirmDelete")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
