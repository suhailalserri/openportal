"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AuditLogFilters } from "../hooks/use-audit-logs";

interface AuditFilterBarProps {
  filters: AuditLogFilters;
  onChange: (next: AuditLogFilters) => void;
}

/**
 * apps/web/features/admin/audit/components/audit-filter-bar.tsx (Phase 8c)
 *
 * Four free-text filters (admin id, action, target type, target id) plus
 * the same date-range pair as every other log view in this codebase.
 * There's no admin-picker or fixed action-enum to build a `<Select>`
 * against (`action` is a free-form string like `"user.suspend"` written
 * ad hoc at each `auditLogs.insert` call site across the router), so
 * plain text inputs are the honest representation of what the server
 * actually filters on.
 */
export function AuditFilterBar({ filters, onChange }: AuditFilterBarProps) {
  const t = useTranslations("admin.auditPage.filters");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-admin" className="text-xs font-medium text-muted-foreground">
          {t("adminId")}
        </label>
        <Input
          id="audit-filter-admin"
          value={filters.adminId ?? ""}
          onChange={(e) => onChange({ ...filters, adminId: e.target.value || undefined })}
          placeholder={t("adminIdPlaceholder")}
          className="w-64 font-mono text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-action" className="text-xs font-medium text-muted-foreground">
          {t("action")}
        </label>
        <Input
          id="audit-filter-action"
          value={filters.action ?? ""}
          onChange={(e) => onChange({ ...filters, action: e.target.value || undefined })}
          placeholder={t("actionPlaceholder")}
          className="w-44"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-target-type" className="text-xs font-medium text-muted-foreground">
          {t("targetType")}
        </label>
        <Input
          id="audit-filter-target-type"
          value={filters.targetType ?? ""}
          onChange={(e) => onChange({ ...filters, targetType: e.target.value || undefined })}
          placeholder={t("targetTypePlaceholder")}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-target-id" className="text-xs font-medium text-muted-foreground">
          {t("targetId")}
        </label>
        <Input
          id="audit-filter-target-id"
          value={filters.targetId ?? ""}
          onChange={(e) => onChange({ ...filters, targetId: e.target.value || undefined })}
          placeholder={t("targetIdPlaceholder")}
          className="w-64 font-mono text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-from" className="text-xs font-medium text-muted-foreground">
          {t("from")}
        </label>
        <Input
          id="audit-filter-from"
          type="date"
          value={filters.from ?? ""}
          max={filters.to || undefined}
          onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-to" className="text-xs font-medium text-muted-foreground">
          {t("to")}
        </label>
        <Input
          id="audit-filter-to"
          type="date"
          value={filters.to ?? ""}
          min={filters.from || undefined}
          onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          className="w-40"
        />
      </div>

      {(filters.from || filters.to || filters.adminId || filters.action || filters.targetType || filters.targetId) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
          {t("clear")}
        </Button>
      )}
    </div>
  );
}
