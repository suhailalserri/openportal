import type { SortDirection } from "./types";

/**
 * apps/web/components/data-table/data-table-url-state.ts (Phase 8a)
 *
 * Pure functions only (no `next/navigation`, no React) so they can be
 * unit-tested directly — same split as `config/nav.ts`'s
 * `isNavItemActive` and `features/dashboard/lib/period-range.ts`: the
 * hook in `use-data-table-url-state.ts` is a thin wrapper around these
 * that this sandbox cannot exercise (needs a real `useSearchParams`/
 * `useRouter`), but the actual parsing/serialization logic — the part
 * that's actually at risk of an off-by-one or a silent NaN — is fully
 * covered here.
 *
 * `prefix` namespaces the search-param keys (e.g. "users_page" vs
 * "codes_page") so two DataTables on the same page (unlikely today,
 * plausible once 8b's users/codes pages both exist under one route
 * group) never collide. Default prefix "" keeps single-table pages'
 * URLs short (`?page=2` not `?_page=2`).
 */
export interface DataTableUrlParams {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string | undefined;
  sortDir: SortDirection;
}

export interface DataTableUrlDefaults {
  pageSize: number;
  sortBy?: string;
  sortDir?: SortDirection;
}

function key(prefix: string, name: string): string {
  return prefix ? `${prefix}_${name}` : name;
}

/** Positive integer or the fallback — guards against `?page=abc`, `?page=-3`, `?page=0`. */
function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export function parseDataTableParams(
  searchParams: URLSearchParams,
  defaults: DataTableUrlDefaults,
  prefix = "",
): DataTableUrlParams {
  const rawSortDir = searchParams.get(key(prefix, "dir"));
  const sortDir: SortDirection = rawSortDir === "asc" || rawSortDir === "desc" ? rawSortDir : defaults.sortDir ?? "desc";

  return {
    page: parsePositiveInt(searchParams.get(key(prefix, "page")), 1),
    pageSize: parsePositiveInt(searchParams.get(key(prefix, "pageSize")), defaults.pageSize),
    search: searchParams.get(key(prefix, "q")) ?? "",
    sortBy: searchParams.get(key(prefix, "sort")) ?? defaults.sortBy,
    sortDir,
  };
}

/**
 * Returns a NEW `URLSearchParams` (never mutates `current`) with this
 * table's keys applied on top of every OTHER param already in the URL —
 * so a second table's params, or an unrelated param like `?tab=`, is
 * never clobbered by this one's updates.
 *
 * Changing `search`/`pageSize`/`sort` resets `page` to 1 (new result set,
 * old page number would likely be past the end); changing `page` itself
 * obviously does not.
 */
export function buildDataTableSearchParams(
  current: URLSearchParams,
  patch: Partial<DataTableUrlParams>,
  defaults: DataTableUrlDefaults,
  prefix = "",
): URLSearchParams {
  const next = new URLSearchParams(current);
  const resettingPage = "search" in patch || "pageSize" in patch || "sortBy" in patch || "sortDir" in patch;

  if (patch.page !== undefined) next.set(key(prefix, "page"), String(patch.page));
  else if (resettingPage) next.set(key(prefix, "page"), "1");

  if (patch.pageSize !== undefined) {
    if (patch.pageSize === defaults.pageSize) next.delete(key(prefix, "pageSize"));
    else next.set(key(prefix, "pageSize"), String(patch.pageSize));
  }

  if (patch.search !== undefined) {
    if (patch.search === "") next.delete(key(prefix, "q"));
    else next.set(key(prefix, "q"), patch.search);
  }

  if (patch.sortBy !== undefined) {
    if (patch.sortBy === defaults.sortBy) next.delete(key(prefix, "sort"));
    else next.set(key(prefix, "sort"), patch.sortBy);
  }

  if (patch.sortDir !== undefined) {
    if (patch.sortDir === (defaults.sortDir ?? "desc")) next.delete(key(prefix, "dir"));
    else next.set(key(prefix, "dir"), patch.sortDir);
  }

  return next;
}

/**
 * Clicking a sortable header: same column → flip direction; a different
 * column → that column, descending first (matches every admin list's
 * natural order — newest/highest first — so the first click after
 * switching columns is never a "wrong direction" surprise).
 */
export function toggleSort(
  current: { sortBy: string | undefined; sortDir: SortDirection },
  columnId: string,
): { sortBy: string; sortDir: SortDirection } {
  if (current.sortBy === columnId) {
    return { sortBy: columnId, sortDir: current.sortDir === "asc" ? "desc" : "asc" };
  }
  return { sortBy: columnId, sortDir: "desc" };
}
