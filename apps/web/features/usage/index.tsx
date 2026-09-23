"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SectionPage } from "@/components/layout/section-page";
import { useUsageLog, useUsageLogFilterState } from "./hooks/use-usage-log";
import { UsageFilterBar } from "./components/usage-filter-bar";
import { UsageTable } from "./components/usage-table";
import { UsageRowDetail } from "./components/usage-row-detail";
import { UsageEmptyState } from "./components/usage-empty-state";
import type { UsageListItem } from "./types";

/**
 * apps/web/features/usage/index.tsx (Phase 6.2)
 *
 * `(app)/layout.tsx` already ran the server session guard (Rule 4)
 * before this renders — same pattern as `DashboardView` (6.1) and
 * `BillingView` (5.x): no client-side auth check here, only
 * loading/error/empty data states.
 *
 * Filter state lives here (`useUsageLogFilterState`) and is passed both
 * to `useUsageLog` (the table's data) and `UsageFilterBar` (the export
 * link) — the single source of truth that keeps "what's on screen" and
 * "what the CSV export downloads" from ever disagreeing, per the phase
 * summary's point 4.
 */
export function UsageLogView() {
  const tNav = useTranslations("nav");
  const t = useTranslations("usage");
  const { filters, setFilters } = useUsageLogFilterState();
  const [selectedRow, setSelectedRow] = useState<UsageListItem | null>(null);

  const { items, isLoading, isError, isEmpty, hasMore, isFetchingMore, loadMore } = useUsageLog(filters);

  return (
    <SectionPage title={tNav("usage")}>
      <UsageFilterBar filters={filters} onChange={setFilters} />

      {isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t("error")}
        </p>
      ) : isEmpty ? (
        <UsageEmptyState />
      ) : (
        <UsageTable
          items={items}
          isLoading={isLoading}
          hasMore={hasMore}
          isFetchingMore={isFetchingMore}
          onLoadMore={loadMore}
          onSelectRow={setSelectedRow}
        />
      )}

      <UsageRowDetail row={selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)} />
    </SectionPage>
  );
}
