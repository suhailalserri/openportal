"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCw, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataTableColumn, DataTableLabels, DataTablePaginationState, DataTableSearchState, DataTableSortState } from "./types";

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  labels: DataTableLabels;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  search?: DataTableSearchState;
  sort?: DataTableSortState;
  pagination?: DataTablePaginationState;
  /** Shows the column-visibility dropdown. Default true. */
  enableColumnVisibility?: boolean;
  className?: string;
}

/**
 * apps/web/components/data-table/data-table.tsx (Phase 8a)
 *
 * "New API reference: `src/components/data-table/*` (structure only)" —
 * this is a from-scratch implementation (AGPL source, not copied), same
 * shape: search + column-visibility + sort + pagination + loading/empty/
 * error states, all driven by props so 8b's users/codes tables and 8c's
 * logs/audit tables are thin callers, not forks of this file.
 *
 * Server-driven, not client-side: `rows` is exactly what the current
 * page's query returned — no client-side re-sort/re-filter/re-paginate
 * of a full dataset ever happens here (Rule 1's "server computes"
 * reasoning extends to "the server decides what's on this page", same
 * as `usage-table.tsx`'s cursor pagination). `sort`/`search`/
 * `pagination` are optional so a genuinely static small table (e.g. a
 * batch's code list) can use this without wiring controls it doesn't
 * need.
 *
 * Column visibility is local `useState`, intentionally NOT URL-synced —
 * unlike page/search/sort it doesn't change what's fetched, and syncing
 * pure display prefs to the URL would add search-param noise for no
 * behavioural benefit.
 *
 * RTL: `Table`/`TableCell` already use logical alignment via
 * `align="start" | "end"` (never "left"/"right" — Rule 2), and the sort
 * icon sits before the header text in DOM order so it flows to the
 * correct visual side under `dir="rtl"` automatically, same reasoning as
 * `usage-table.tsx`'s `text-end` on numeric columns.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  labels,
  isLoading = false,
  isError = false,
  onRetry,
  onRowClick,
  search,
  sort,
  pagination,
  enableColumnVisibility = true,
  className,
}: DataTableProps<T>) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.id)),
  );

  const visibleColumns = columns.filter((c) => !hiddenIds.has(c.id));
  const toggleableColumns = columns.filter((c) => !c.alwaysVisible);

  function toggleColumn(id: string, visible: boolean) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const showToolbar = Boolean(search) || (enableColumnVisibility && toggleableColumns.length > 0);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {search ? (
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? labels.search}
              className="max-w-xs"
            />
          ) : (
            <div />
          )}
          {enableColumnVisibility && toggleableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <Settings2 aria-hidden="true" className="size-3.5" />
                  {labels.columns}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{labels.columns}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {toggleableColumns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!hiddenIds.has(c.id)}
                    onCheckedChange={(checked) => toggleColumn(c.id, checked)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead key={col.id} className={col.align === "end" ? "text-end" : undefined}>
                  {col.sortable && sort ? (
                    <button
                      type="button"
                      onClick={() => sort.onSortChange(col.id)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {col.header}
                      {sort.sortBy !== col.id ? (
                        <ArrowUpDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
                      ) : sort.sortDir === "asc" ? (
                        <ArrowUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {visibleColumns.map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                    <span>{labels.error}</span>
                    {onRetry && (
                      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
                        <RotateCw aria-hidden="true" className="size-3.5" />
                        {labels.retry}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="py-10 text-center text-sm text-muted-foreground">
                  {labels.empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "cursor-pointer hover:bg-secondary/60" : undefined}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {visibleColumns.map((col) => (
                    <TableCell key={col.id} className={col.align === "end" ? "text-end tabular-nums" : undefined}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && !isLoading && !isError && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {pagination.onPageSizeChange ? (
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange?.(Number(e.target.value))}
              aria-label={labels.rowsPerPage}
              className="h-9 rounded-[11px] border border-input bg-secondary px-2 text-sm text-foreground"
            >
              {(pagination.pageSizeOptions ?? [10, 20, 50, 100]).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              {labels.previous}
            </Button>
            <span className="text-sm text-muted-foreground">{labels.pageOf(pagination.page)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              {labels.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
