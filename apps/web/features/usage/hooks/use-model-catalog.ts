"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";

export interface ModelCatalogEntry {
  displayName: string;
  displayNameAr: string;
  badge: string;
  provider: string;
}

/**
 * apps/web/features/usage/hooks/use-model-catalog.ts (Phase 6.2)
 *
 * Deliberate near-duplicate of
 * `features/dashboard/hooks/use-model-catalog.ts` (6.1) rather than an
 * import across feature folders — each `features/*` module is meant to
 * be self-contained (FRONTEND_REBUILD_PLAN.md §4: "Each feature folder
 * follows the New API convention: components/ hooks/ lib/ types.ts
 * index.tsx"). The underlying query (`models.list`, public, cached) is
 * shared and deduped by React Query's query-key cache either way, so
 * this costs nothing at runtime — it's only a source-level duplication,
 * and a small one (single hook, ~20 lines).
 *
 * Used for: (a) the model filter dropdown's labels, (b) the usage
 * table's model column, (c) the row-detail sheet. Same fallback
 * contract as the dashboard's copy: a model used in the selected period
 * but since unpublished/disabled won't be in `models.list`'s response,
 * so every call site here falls back to the raw id rather than assuming
 * a catalog hit.
 */
export function useModelCatalog() {
  const query = trpc.models.list.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const byId = useMemo(() => {
    const map = new Map<string, ModelCatalogEntry>();
    for (const model of query.data ?? []) {
      map.set(model.id, {
        displayName: model.displayName,
        displayNameAr: model.displayNameAr,
        badge: model.badge,
        provider: model.provider,
      });
    }
    return map;
  }, [query.data]);

  return { byId, models: query.data ?? [], isLoading: query.isLoading };
}
