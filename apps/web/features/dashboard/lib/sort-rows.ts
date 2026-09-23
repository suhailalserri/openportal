import type { UsageByModelRow } from "../types";

export type ModelBreakdownSortKey = "model" | "requests" | "tokens" | "spent";
export type SortDirection = "asc" | "desc";

export const DEFAULT_MODEL_SORT: { key: ModelBreakdownSortKey; direction: SortDirection } = {
  key: "spent",
  direction: "desc",
};

/**
 * apps/web/features/dashboard/lib/sort-rows.ts (Phase 6.1 polish)
 *
 * Pure comparator for the per-model breakdown table's sortable headers
 * (model-breakdown.tsx). Kept out of the component, not inline, so it's
 * testable under vitest's node environment without a DOM — same pattern
 * as lib/period-range.ts.
 *
 * Client-side display sort only, same spirit as the original file's own
 * "sorted by spend descending" comment it's replacing: no re-query, no
 * money recomputed, only re-ordered for presentation.
 *
 * "tokens" sorts by inputTokens + outputTokens combined — the table
 * shows the two side by side with no single "tokens" column value, so
 * their sum is the only sensible total to sort by.
 *
 * `modelId` is typed `string | null` on `UsageByModelRow` (`usage.service.ts`,
 * frozen — a transaction can carry a null modelId). Compared via `?? ""`,
 * which is a comparator-only string-compare fallback, not a display value;
 * null rows just sort first/last alphabetically. `model-breakdown.tsx` is
 * responsible for what a null id actually renders as.
 */
export function sortModelRows(
  rows: readonly UsageByModelRow[],
  key: ModelBreakdownSortKey,
  direction: SortDirection
): UsageByModelRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "model":
        return factor * (a.modelId ?? "").localeCompare(b.modelId ?? "");
      case "requests":
        return factor * (a.requestCount - b.requestCount);
      case "tokens":
        return factor * (a.inputTokens + a.outputTokens - (b.inputTokens + b.outputTokens));
      case "spent":
        return factor * (a.spentMicroCredits - b.spentMicroCredits);
      default:
        return 0;
    }
  });
}

/** Click-on-header reducer: same key toggles direction, a new key picks a sensible default (name ascending, everything numeric descending — "biggest first" reads naturally for spend/requests/tokens). */
export function nextModelSort(
  current: { key: ModelBreakdownSortKey; direction: SortDirection },
  clicked: ModelBreakdownSortKey
): { key: ModelBreakdownSortKey; direction: SortDirection } {
  if (current.key === clicked) {
    return { key: clicked, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: clicked, direction: clicked === "model" ? "asc" : "desc" };
}
