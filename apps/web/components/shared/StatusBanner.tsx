"use client";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

interface StatusData { overall: "healthy" | "degraded" | "outage"; message?: string }

export function StatusBanner() {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch("/api/status");
        const data = await res.json() as StatusData;
        setStatus(data);
      } catch { /* ignore */ }
    }
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!status || status.overall === "healthy") return null;

  return (
    <div className="status-warning border-b border-amber-500/20 px-4 py-2 text-center animate-fade-in">
      <p className="flex items-center justify-center gap-1.5 text-sm">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {status.message ?? "بعض الخدمات تعاني من بطء"}
        {" — "}
        <a href="/status" target="_blank" rel="noopener"
          className="underline hover:text-amber-300 transition-colors">
          عرض التفاصيل
        </a>
      </p>
    </div>
  );
}
