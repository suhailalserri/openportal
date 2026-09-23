"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * apps/web/features/settings/sections/data-privacy/export-data-button.tsx (Phase 7.2)
 *
 * `GET /api/user/export-data` (frozen route, F-list §1) is a plain
 * authenticated GET returning a downloadable JSON body with a
 * Content-Disposition header — fetched client-side (not a plain
 * `<a href>`) purely so this button can show a loading state while the
 * (potentially large, full transaction history) response streams in.
 */
export function ExportDataButton() {
  const t = useTranslations("settings.data");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleExport() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/user/export-data");
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "account-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleExport} disabled={busy}>
        {busy ? t("exporting") : t("export")}
      </Button>
      {error && <p className="text-xs text-destructive">{t("errors.exportGeneric")}</p>}
    </div>
  );
}
