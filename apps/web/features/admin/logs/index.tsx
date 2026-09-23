"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useAdminLogFilterState, useAdminLogs } from "./hooks/use-admin-logs";
import { LogsFilterBar } from "./components/logs-filter-bar";
import { LogsTable } from "./components/logs-table";

/**
 * apps/web/features/admin/logs/index.tsx (Phase 8c)
 *
 * `(admin)/layout.tsx` already ran the role guard (Rule 4). Structure
 * mirrors `features/usage/index.tsx` (6.2) — filter state lives here and
 * is handed to both the data hook and the filter bar, so what's on
 * screen and what's being queried can never drift apart.
 */
export function AdminLogs() {
  const t = useTranslations("admin.logsPage");
  const { filters, setFilters } = useAdminLogFilterState();
  const { items, isLoading, isError, isEmpty, hasMore, isFetchingMore, loadMore, refetch } = useAdminLogs(filters);

  return (
    <div className="flex flex-col gap-4">
      <LogsFilterBar filters={filters} onChange={setFilters} />

      {isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={refetch}>{t("retry")}</Button>
        </div>
      ) : isEmpty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("table.empty")}</p>
      ) : (
        <LogsTable items={items} isLoading={isLoading} hasMore={hasMore} isFetchingMore={isFetchingMore} onLoadMore={loadMore} />
      )}
    </div>
  );
}
