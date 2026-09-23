"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AdminLogFilters } from "../hooks/use-admin-logs";

interface LogsFilterBarProps {
  filters: AdminLogFilters;
  onChange: (next: AdminLogFilters) => void;
}

/**
 * apps/web/features/admin/logs/components/logs-filter-bar.tsx (Phase 8c)
 *
 * User id + model id (plain text — no admin-wide user/model picker
 * exists yet, unlike `usage-filter-bar.tsx`'s model `<Select>`, which is
 * scoped to the calling user's own usage and can afford to list every
 * model) plus the same two native date inputs as the user-facing usage
 * log. `userId` only affects the query once it parses as a UUID (see
 * `use-admin-logs.ts`); an in-progress partial paste doesn't fire a 400.
 */
export function LogsFilterBar({ filters, onChange }: LogsFilterBarProps) {
  const t = useTranslations("admin.logsPage.filters");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="logs-filter-user" className="text-xs font-medium text-muted-foreground">
          {t("userId")}
        </label>
        <Input
          id="logs-filter-user"
          value={filters.userId ?? ""}
          onChange={(e) => onChange({ ...filters, userId: e.target.value || undefined })}
          placeholder={t("userIdPlaceholder")}
          className="w-64 font-mono text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="logs-filter-model" className="text-xs font-medium text-muted-foreground">
          {t("modelId")}
        </label>
        <Input
          id="logs-filter-model"
          value={filters.modelId ?? ""}
          onChange={(e) => onChange({ ...filters, modelId: e.target.value || undefined })}
          placeholder={t("modelIdPlaceholder")}
          className="w-48"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="logs-filter-from" className="text-xs font-medium text-muted-foreground">
          {t("from")}
        </label>
        <Input
          id="logs-filter-from"
          type="date"
          value={filters.from ?? ""}
          max={filters.to || undefined}
          onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="logs-filter-to" className="text-xs font-medium text-muted-foreground">
          {t("to")}
        </label>
        <Input
          id="logs-filter-to"
          type="date"
          value={filters.to ?? ""}
          min={filters.from || undefined}
          onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          className="w-40"
        />
      </div>

      {(filters.from || filters.to || filters.userId || filters.modelId) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
          {t("clear")}
        </Button>
      )}
    </div>
  );
}
