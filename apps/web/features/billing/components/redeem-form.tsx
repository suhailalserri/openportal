"use client";

import type * as React from "react";
import { useCallback, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardPaste, Gift, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { cn } from "@/lib/utils";
import { formatRedeemInput, isRedeemShapeComplete } from "../lib/redeem-shape";
import { useRedeem } from "../hooks/use-redeem";

/**
 * apps/web/features/billing/components/redeem-form.tsx (Phase 5.1)
 *
 * Posts to the frozen `POST /api/redeem` (via `useRedeem`). The submit
 * button and Enter-to-submit are both disabled until:
 *   - the formatted value has the full 4x4 shape (isRedeemShapeComplete —
 *     shape only, Rule 5, never the checksum), AND
 *   - a Turnstile token is present (or the widget reported the
 *     no-Turnstile-configured placeholder, matching the dev/local
 *     behavior `turnstile-widget.tsx` already documents), AND
 *   - no request is currently pending (no double-submit).
 *
 * Hitting Enter inside the input submits the form (native `<form
 * onSubmit>` + `type="submit"` button) — this is what fires the side
 * cannons on success via `useRedeem`, satisfying "when users enter the
 * redeem code and hit enter."
 */
export function RedeemForm() {
  const t = useTranslations("redeem");
  const locale = useLocale() as "ar" | "en";
  const inputId = useId();
  const [value, setValue] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const { submit, isPending, errorMessage } = useRedeem(locale);

  const isComplete = isRedeemShapeComplete(value);
  const canSubmit = isComplete && turnstileToken !== null && !isPending;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(formatRedeemInput(e.target.value));
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(formatRedeemInput(text));
    } catch {
      // Clipboard permission denied/unavailable — the input remains
      // manually editable, so this is a silent no-op, not an error state.
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      void submit(value, turnstileToken).then((succeeded) => {
        // Clear the field only after a confirmed successful redeem, so a
        // failed attempt (e.g. ALREADY_USED) leaves the code visible to
        // edit rather than making the user retype it from scratch.
        if (succeeded) setValue("");
      });
    },
    [canSubmit, submit, value, turnstileToken]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>{t("title")}</Label>
            <div className="flex gap-2">
              <Input
                id={inputId}
                value={value}
                onChange={handleChange}
                placeholder={t("placeholder")}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={19} // 16 alphabet chars + 3 dashes
                dir="ltr" // codes are always Latin/Western — Rule 2's code-block LTR spirit applies here too
                aria-invalid={errorMessage ? true : undefined}
                aria-describedby={errorMessage ? `${inputId}-error` : undefined}
                className="font-mono tracking-wider"
                disabled={isPending}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handlePaste}
                disabled={isPending}
                aria-label={t("button")}
              >
                <ClipboardPaste aria-hidden="true" className="size-4" />
              </Button>
            </div>
            {errorMessage ? (
              <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <TurnstileWidget onToken={setTurnstileToken} />

          <Button type="submit" disabled={!canSubmit} className={cn("self-start")}>
            {isPending ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                {t("loading")}
              </>
            ) : (
              t("button")
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
