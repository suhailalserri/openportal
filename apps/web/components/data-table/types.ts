import type * as React from "react";

/**
 * apps/web/components/data-table/types.ts (Phase 8a)
 *
 * `header`/`cell` are already-translated `ReactNode`, not i18n keys — the
 * same split `features/usage/components/usage-table.tsx` (6.2) uses:
 * translation happens in the FEATURE that owns the copy, this component
 * only lays things out. Keeps `DataTable` itself free of any
 * `useTranslations` call, so it stays usable from anywhere (including a
 * future non-admin table) without dragging in a namespace assumption.
 */
export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Enables the sort toggle in the header cell. Requires `sort` on `DataTable`. */
  sortable?: boolean;
  align?: "start" | "end";
  /** Column starts hidden; still listed (and re-enrollable) in the visibility menu. */
  hiddenByDefault?: boolean;
  /** Omit from the visibility menu entirely (e.g. a row-actions column). */
  alwaysVisible?: boolean;
}

export type SortDirection = "asc" | "desc";

export interface DataTableSortState {
  sortBy: string | undefined;
  sortDir: SortDirection;
  /** Called with the column id that was clicked; the component does not decide asc/desc itself — see `use-data-table-url-state.ts`'s `toggleSort` for the one place that logic lives. */
  onSortChange: (columnId: string) => void;
}

export interface DataTablePaginationState {
  page: number;
  pageSize: number;
  /** From the server response (e.g. `rows.length === limit`) — no total-count assumption, matches every `admin.*`/`billing.*` list procedure today (offset+`hasMore`, no `COUNT(*)`). */
  hasMore: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}

export interface DataTableSearchState {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Every user-facing string the table needs, supplied by the caller (Rule 6). */
export interface DataTableLabels {
  search: string;
  columns: string;
  rowsPerPage: string;
  pageOf: (page: number) => string;
  previous: string;
  next: string;
  empty: string;
  error: string;
  retry: string;
}
