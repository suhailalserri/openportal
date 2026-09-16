"use client";
import { useTranslations, useLocale } from "next-intl";
import { ChevronDown, Check, Eye, AlertTriangle, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";

interface Props { value: string; onChange: (modelId: string) => void }

// Models come from trpc.models.list, which reads the `models` DB table
// (status="published" AND isAvailable=true only) — the same table the
// admin "Pending Models" queue publishes into after a gateway sync. No
// more static MODEL_CATALOG here.
export function ModelSelector({ value, onChange }: Props) {
  const t        = useTranslations();
  const locale   = useLocale();
  const dir      = locale === "ar" ? "rtl" : "ltr";
  const { data: available = [], isLoading } = trpc.models.list.useQuery();
  const selected = available.find(m => m.id === value) ?? available[0];
  const nameOf = (m: NonNullable<typeof selected>) => (locale === "ar" ? m.displayNameAr : m.displayName);

  // If the previously-selected model got hidden/disabled, fall back to
  // whatever's first in the live list so the picker never shows a ghost model.
  useEffect(() => {
    if (!isLoading && available.length > 0 && !available.some(m => m.id === value)) {
      onChange(available[0]!.id);
    }
  }, [isLoading, available, value, onChange]);

  const tierColors: Record<string, string> = {
    premium:  "text-amber-400",
    standard: "text-blue-400",
    free:     "text-emerald-400",
  };

  // Real measurement from New API's channel health check (see
  // gateway-channels.service.ts), averaged per model and refreshed on
  // each admin "sync now". Thresholds are just a display grouping —
  // the exact ms value is always shown alongside, never hidden behind
  // a vague label alone.
  function speedColor(ms: number): string {
    if (ms < 800)  return "text-emerald-400";
    if (ms < 2000) return "text-amber-400";
    return "text-red-400";
  }

  if (isLoading) {
    return (
      <div className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-500 animate-pulse">
        <span className="inline-block w-20 h-4 bg-slate-700 rounded" />
      </div>
    );
  }

  if (available.length === 0 || !selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-red-800 rounded-xl text-sm text-red-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t("models.noneAvailable")}
      </div>
    );
  }

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 bg-slate-800 hover:bg-slate-700
                     border border-slate-600 rounded-xl text-sm text-white transition-colors
                     data-[state=open]:border-blue-600 data-[state=open]:bg-slate-700"
        >
          <span>{selected.badge}</span>
          <span className="max-w-[72px] sm:max-w-[120px] truncate">{nameOf(selected)}</span>
          {/* Latency is genuinely useful at desktop width but is the first
              thing to go on a phone — badge, name and the dropdown chevron
              already fill the row next to the conversation title, and
              adding "⚡1,930ms" on top of that is what was squeezing
              everything down to unreadable sizes. Full detail is still one
              tap away in the dropdown below. */}
          {selected.avgResponseTimeMs != null && (
            <span
              className={`hidden sm:flex items-center gap-0.5 text-xs ${speedColor(selected.avgResponseTimeMs)}`}
              title={t("models.latencyTooltip")}
            >
              <Zap className="h-3 w-3" />
              {selected.avgResponseTimeMs.toLocaleString()}ms
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 data-[state=open]:rotate-180 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-72 max-h-80 overflow-y-auto">
        {available.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onSelect={() => onChange(model.id)}
            className={model.id === value ? "bg-blue-600/20" : undefined}
          >
            <span className="text-xl shrink-0">{model.badge}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{nameOf(model)}</span>
                <span className={`text-xs font-medium ${tierColors[model.tier] ?? "text-slate-400"}`}>
                  {t(`models.${model.tier}` as Parameters<typeof t>[0])}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                <span className="capitalize">{model.provider}</span>
                <span aria-hidden className="text-slate-600">·</span>
                {(model.contextWindow / 1000).toFixed(0)}k {t("models.contextWindow")}
                {model.supportsVision && <Eye className="h-3 w-3 ms-1" />}
                {model.avgResponseTimeMs != null && (
                  <>
                    <span aria-hidden className="text-slate-600">·</span>
                    <span
                      className={`flex items-center gap-0.5 ${speedColor(model.avgResponseTimeMs)}`}
                      title={t("models.latencyTooltip")}
                    >
                      <Zap className="h-3 w-3" />
                      {model.avgResponseTimeMs.toLocaleString()}ms
                    </span>
                  </>
                )}
              </div>
            </div>
            {model.id === value && <Check className="h-4 w-4 shrink-0 text-blue-400" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
