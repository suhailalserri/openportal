"use client";

import { useTranslations, useLocale } from "next-intl";
import { Download } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModelCatalog } from "../hooks/use-model-catalog";
import { buildExportUrl } from "../lib/build-export-url";
import type { UsageLogFilters } from "../hooks/use-usage-log";

const ALL_MODELS = "__all__";

interface UsageFilterBarProps {
  filters: UsageLogFilters;
  onChange: (next: UsageLogFilters) => void;
}

/**
 * apps/web/features/usage/components/usage-filter-bar.tsx (Phase 6.2)
 *
 * Model select + two native `<input type="date">` fields + the CSV
 * export link, all reading/writing the single `filters` object the
 * parent (`UsageLogView`) also passes to `useUsageLog`. The export link
 * is built from the exact same object (`buildExportUrl(filters)`), which
 * is the mechanism that keeps "download" and "on-screen" in sync — see
 * `lib/build-export-url.ts`'s doc comment.
 *
 * Native date inputs (not a calendar-picker component — none exists in
 * `components/ui/` yet, and the plan doesn't call for building one) are
 * used deliberately: they're free RTL/locale correctness (the browser
 * renders them per the page's `lang`), free keyboard support, and avoid
 * pulling in a new dependency for what the plan describes simply as
 * "date range" filtering.
 */
export function UsageFilterBar({ filters, onChange }: UsageFilterBarProps) {
  const t = useTranslations("usage.filters");
  const locale = useLocale() as "ar" | "en";
  const { models, isLoading: modelsLoading } = useModelCatalog();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="usage-filter-model" className="text-xs font-medium text-muted-foreground">
          {t("model")}
        </label>
        <Select
          value={filters.modelId ?? ALL_MODELS}
          onValueChange={(value) => onChange({ ...filters, modelId: value === ALL_MODELS ? undefined : value })}
          disabled={modelsLoading}
        >
          <SelectTrigger id="usage-filter-model" className="min-w-40">
            <SelectValue placeholder={t("allModels")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MODELS}>{t("allModels")}</SelectItem>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {locale === "ar" ? model.displayNameAr : model.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="usage-filter-from" className="text-xs font-medium text-muted-foreground">
          {t("from")}
        </label>
        <Input
          id="usage-filter-from"
          type="date"
          value={filters.from ?? ""}
          max={filters.to || undefined}
          onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="usage-filter-to" className="text-xs font-medium text-muted-foreground">
          {t("to")}
        </label>
        <Input
          id="usage-filter-to"
          type="date"
          value={filters.to ?? ""}
          min={filters.from || undefined}
          onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          className="w-40"
        />
      </div>

      {(filters.from || filters.to || filters.modelId) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
          {t("clear")}
        </Button>
      )}

      <a
        href={buildExportUrl(filters)}
        className="ms-auto inline-flex items-center gap-1.5 rounded-[11px] border border-input bg-secondary px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        <Download className="size-4" aria-hidden="true" />
        {t("export")}
      </a>
    </div>
  );
}
