"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/auth/form-error-banner";

type EnableStep = "closed" | "password" | "scan" | "backupCodes";

/**
 * apps/web/features/settings/sections/security/two-factor-section.tsx (Phase 7.1)
 *
 * `authClient.twoFactor.enable({ password })` → `{ totpURI, backupCodes }`
 * → user scans the QR (rendered client-side by `qrcode.react`'s
 * `QRCodeSVG`, an actual SVG React component — no `dangerouslySetInnerHTML`,
 * Rule 7's model-output concern doesn't apply here since `totpURI` is our
 * own server's response, not model/user content, but there's no reason
 * to introduce raw HTML injection either way) → user enters the 6-digit
 * code → `authClient.twoFactor.verifyTotp({ code })` confirms enrollment
 * → backup codes (already returned by `enable()`) are shown once, gated
 * behind an explicit "I've saved these" confirmation before the dialog
 * can close — this is the ONLY place they are ever shown; nothing
 * refetches or redisplays them later.
 *
 * NOT VERIFIED (flagged in the phase summary): the exact request/response
 * field names of `twoFactor.enable` / `verifyTotp` / `disable` on this
 * repo's pinned better-auth version were not executed against a running
 * server in this sandbox (no network/install). This follows the plan's
 * own §6 wording for 7.1 ("enable → QR (from twoFactor.enable) → verify
 * → backup codes shown once"), which already assumes this shape.
 */
export function TwoFactorSection() {
  const t = useTranslations("settings.security.twoFactor");
  const utils = trpc.useUtils();
  const { data: profile } = trpc.user.getProfile.useQuery();
  const enabled = profile?.twoFactorEnabled ?? false;

  const [step, setStep] = useState<EnableStep>("closed");
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableBusy, setDisableBusy] = useState(false);

  function resetEnableFlow() {
    setStep("closed");
    setPassword("");
    setTotpURI(null);
    setBackupCodes([]);
    setCode("");
    setSavedConfirmed(false);
    setError(null);
  }

  async function submitPassword() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data) {
      setError(err?.status === 401 || err?.status === 400 ? t("errors.incorrectPassword") : t("errors.generic"));
      return;
    }
    setTotpURI(data.totpURI);
    setBackupCodes(data.backupCodes ?? []);
    setStep("scan");
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) {
      setError(t("errors.invalidCode"));
      return;
    }
    setStep("backupCodes");
  }

  async function finishEnable() {
    resetEnableFlow();
    await utils.user.getProfile.invalidate();
  }

  async function submitDisable() {
    setDisableBusy(true);
    setDisableError(null);
    const { error: err } = await authClient.twoFactor.disable({ password: disablePassword });
    setDisableBusy(false);
    if (err) {
      setDisableError(err.status === 401 || err.status === 400 ? t("errors.incorrectPassword") : t("errors.generic"));
      return;
    }
    setDisableOpen(false);
    setDisablePassword("");
    await utils.user.getProfile.invalidate();
  }

  function copyBackupCodes() {
    void navigator.clipboard.writeText(backupCodes.join("\n"));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        <Badge variant={enabled ? "success" : "secondary"}>
          {enabled ? t("statusOn") : t("statusOff")}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        {enabled ? (
          <Button type="button" variant="destructive" className="w-fit gap-1.5" onClick={() => setDisableOpen(true)}>
            <ShieldOff className="size-4" aria-hidden="true" />
            {t("disable")}
          </Button>
        ) : (
          <Button type="button" className="w-fit gap-1.5" onClick={() => setStep("password")}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("enable")}
          </Button>
        )}
      </CardContent>

      {/* ── Enable flow ─────────────────────────────────────────────── */}
      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && resetEnableFlow()}>
        <DialogContent>
          {step === "password" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("dialog.passwordTitle")}</DialogTitle>
              </DialogHeader>
              {error && <FormErrorBanner message={error} />}
              <div className="flex flex-col gap-2">
                <Label htmlFor="tfa-password">{t("dialog.passwordLabel")}</Label>
                <Input
                  id="tfa-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" disabled={!password || busy} onClick={submitPassword}>
                  {busy ? t("dialog.verifying") : t("dialog.continue")}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "scan" && totpURI && (
            <>
              <DialogHeader>
                <DialogTitle>{t("dialog.scanTitle")}</DialogTitle>
              </DialogHeader>
              {error && <FormErrorBanner message={error} />}
              <p className="text-sm text-muted-foreground">{t("dialog.scanDescription")}</p>
              <div className="flex justify-center rounded-[14px] bg-white p-4">
                <QRCodeSVG value={totpURI} size={180} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tfa-code">{t("dialog.codeLabel")}</Label>
                <Input
                  id="tfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center tracking-[0.4em]"
                />
              </div>
              <DialogFooter>
                <Button type="button" disabled={code.length !== 6 || busy} onClick={submitCode}>
                  {busy ? t("dialog.verifying") : t("dialog.verify")}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "backupCodes" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("dialog.backupTitle")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("dialog.backupDescription")}</p>
              <div className="flex flex-col gap-1 rounded-[11px] border border-input bg-secondary p-3 font-mono text-sm">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5" onClick={copyBackupCodes}>
                <Copy className="size-3.5" aria-hidden="true" />
                {t("dialog.copyBackupCodes")}
              </Button>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={savedConfirmed}
                  onChange={(e) => setSavedConfirmed(e.target.checked)}
                  className="size-4"
                />
                {t("dialog.savedConfirm")}
              </label>
              <DialogFooter>
                <Button type="button" disabled={!savedConfirmed} onClick={finishEnable}>
                  {t("dialog.done")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Disable flow ────────────────────────────────────────────── */}
      <Dialog open={disableOpen} onOpenChange={(open) => { setDisableOpen(open); if (!open) { setDisablePassword(""); setDisableError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.disableTitle")}</DialogTitle>
          </DialogHeader>
          {disableError && <FormErrorBanner message={disableError} />}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tfa-disable-password">{t("dialog.passwordLabel")}</Label>
            <Input
              id="tfa-disable-password"
              type="password"
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={!disablePassword || disableBusy} onClick={submitDisable}>
              {disableBusy ? t("dialog.verifying") : t("disable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
