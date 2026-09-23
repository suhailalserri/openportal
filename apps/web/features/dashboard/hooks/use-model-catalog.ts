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
 * apps/web/features/dashboard/hooks/use-model-catalog.ts (Phase 6.1 polish)
 *
 * `usage.service.ts` (apps/api, frozen) only returns a bare `modelId`
 * string on `usageSummary.topModelId` and `usageByModel[].modelId` — no
 * display name, badge or provider. This joins those ids against
 * `models.list` (public tRPC procedure, the same query the chat
 * composer's model picker already uses via
 * `features/chat/hooks/use-chat-models.ts`) so the dashboard can show a
 * friendly name instead of a raw id like `nex-agi/nex-n2...`.
 *
 * `models.list` returns ONLY published+available models (see
 * `use-chat-models.ts`'s own comment on that router). A model used
 * earlier in the selected period but since unpublished or disabled will
 * NOT be in this map. Every call site here (top-model-card.tsx,
 * model-breakdown.tsx) MUST fall back to the raw id when `byId.get()`
 * returns undefined — this hook does not paper over that gap, it just
 * makes the lookup available.
 *
 * `staleTime`/`refetchOnWindowFocus` mirror `use-chat-models.ts`: the
 * published catalogue changes rarely (an admin action), so there's no
 * reason to refetch on every window focus.
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

  return { byId, isLoading: query.isLoading };
}
