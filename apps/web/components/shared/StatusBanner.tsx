"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

interface StatusData { overall: "healthy" | "degraded" | "outage"; message?: string }

// Polls the real /api/status endpoint. Today that route always returns
// { overall: "healthy" }, so this banner currently never renders — that's
// correct behavior, not a bug: there is no fake "degraded" state to show.
// Once /api/status starts reporting real provider/channel health (Phase
// 20/21 of the backend plan), this component picks it up with no changes.
export function StatusBanner() {
  const t = useTranslations();
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch("/api/status");
        if (!res.ok) return;
        const data = await res.json() as StatusData;
        setStatus(data);
      } catch { /* silent — banner just stays hidden, never fakes a status */ }
    }
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!status || status.overall === "healthy") return null;

  const fallbackMessage = status.overall === "outage" ? t("status.degraded") : t("status.degraded");

  return (
    <div className="status-warning border-b border-amber-500/20 px-4 py-2 text-center animate-fade-in">
      <p className="flex items-center justify-center gap-1.5 text-sm">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {status.message ?? fallbackMessage}
      </p>
    </div>
  );
}
