"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";

interface Props { value: string; onChange: (modelId: string) => void }

// Models come from trpc.models.list, which reads the `models` DB table
// (status="published" AND isAvailable=true only) — the same table the
// admin "Pending Models" queue publishes into after a gateway sync. No
// more static MODEL_CATALOG here.
export function ModelSelector({ value, onChange }: Props) {
  const t                = useTranslations();
  const [open, setOpen]  = useState(false);
  const ref              = useRef<HTMLDivElement>(null);
  const { data: available = [], isLoading } = trpc.models.list.useQuery();
  const selected          = available.find(m => m.id === value) ?? available[0];

  // If the previously-selected model got hidden/disabled, fall back to
  // whatever's first in the live list so the picker never shows a ghost model.
  useEffect(() => {
    if (!isLoading && available.length > 0 && !available.some(m => m.id === value)) {
      onChange(available[0]!.id);
    }
  }, [isLoading, available, value, onChange]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const tierColors: Record<string, string> = {
    premium:  "text-amber-400",
    standard: "text-blue-400",
    free:     "text-emerald-400",
  };

  if (isLoading) {
    return (
      <div className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-500">
        …
      </div>
    );
  }

  if (available.length === 0 || !selected) {
    return (
      <div className="px-3 py-2 bg-slate-800 border border-red-800 rounded-xl text-sm text-red-400">
        {t("models.noneAvailable")}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700
                   border border-slate-600 rounded-xl text-sm text-white transition-colors">
        <span>{selected.badge}</span>
        <span className="max-w-[120px] truncate">{selected.displayNameAr}</span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 start-0 w-72 bg-[#1E293B] border border-slate-700
                        rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-up">
          <div className="p-2 max-h-80 overflow-y-auto">
            {available.map((model) => (
              <button key={model.id}
                onClick={() => { onChange(model.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start
                            transition-colors hover:bg-slate-700
                            ${model.id === value ? "bg-blue-600/20 border border-blue-700/50" : ""}`}>
                <span className="text-xl">{model.badge}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{model.displayNameAr}</span>
                    <span className={`text-xs font-medium ${tierColors[model.tier] ?? "text-slate-400"}`}>
                      {t(`models.${model.tier}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {(model.contextWindow / 1000).toFixed(0)}k {t("models.contextWindow")}
                    {model.supportsVision && " · 👁️"}
                  </div>
                </div>
                {model.id === value && <span className="text-blue-400 text-sm">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
