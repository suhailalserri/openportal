"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import { PASSKEY_ENABLED, isPasskeySupported } from "@/lib/passkey-support";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormErrorBanner } from "@/components/auth/form-error-banner";

interface PasskeyRow {
  id: string;
  name?: string | null | undefined;
  createdAt?: Date | string | null | undefined;
}

/**
 * Settings → Security → Passkeys: list, add and remove the signed-in user's
 * passkeys. This is also where users who dismissed (or never saw) the
 * post-signup card can set one up later. Hidden entirely unless passkeys are
 * enabled for this build.
 *
 * Removing a passkey never locks anyone out: sign-in by password (or Google)
 * is unaffected.
 */
export function PasskeysSection() {
  const t = useTranslations("auth.passkey");
  const locale = useLocale();
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error: err } = await authClient.passkey.listUserPasskeys();
      if (err || !data) {
        setLoadFailed(true);
        setRows([]);
        return;
      }
      setLoadFailed(false);
      setRows(data as PasskeyRow[]);
    } catch {
      setLoadFailed(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (!PASSKEY_ENABLED) return;
    setSupported(isPasskeySupported());
    void load();
  }, [load]);

  if (!PASSKEY_ENABLED) return null;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.passkey.addPasskey();
      if (err) setError(t("setupFailed"));
      else await load();
    } catch {
      setError(t("setupFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.passkey.deletePasskey({ id });
      if (err) setError(t("removeFailed"));
      else await load();
    } catch {
      setError(t("removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("settingsTitle")}
          <Badge>{t("badge")}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">{t("settingsDescription")}</p>

        {error ? <FormErrorBanner message={error} /> : null}
        {loadFailed ? <FormErrorBanner message={t("loadFailed")} /> : null}

        {rows === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name || t("unnamed")}</p>
                  {row.createdAt ? (
                    <p className="text-xs text-muted-foreground">
                      {t("addedOn", { date: new Date(row.createdAt).toLocaleDateString(locale) })}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.id)}
                  disabled={busy}
                  aria-label={t("remove")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {supported ? (
          <Button type="button" variant="outline" onClick={add} disabled={busy} aria-busy={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="size-4" aria-hidden="true" />
            )}
            {t("add")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("unsupported")}</p>
        )}
      </CardContent>
    </Card>
  );
}
