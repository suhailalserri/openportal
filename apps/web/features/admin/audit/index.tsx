"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useAuditLogFilterState, useAuditLogs } from "./hooks/use-audit-logs";
import { AuditFilterBar } from "./components/audit-filter-bar";
import { AuditTable } from "./components/audit-table";

/**
 * apps/web/features/admin/audit/index.tsx (Phase 8c)
 *
 * `(admin)/layout.tsx` already ran the role guard. Same filter-state
 * ownership pattern as `AdminLogs`/`UsageLogView`.
 */
export function AdminAudit() {
  const t = useTranslations("admin.auditPage");
  const { filters, setFilters } = useAuditLogFilterState();
  const { items, isLoading, isError, isEmpty, hasMore, isFetchingMore, loadMore, refetch } = useAuditLogs(filters);

  return (
    <div className="flex flex-col gap-4">
      <AuditFilterBar filters={filters} onChange={setFilters} />

      {isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={refetch}>{t("retry")}</Button>
        </div>
      ) : isEmpty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("table.empty")}</p>
      ) : (
        <AuditTable items={items} isLoading={isLoading} hasMore={hasMore} isFetchingMore={isFetchingMore} onLoadMore={loadMore} />
      )}
    </div>
  );
}
