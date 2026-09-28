"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import type { AdminBadgeKey } from "@ai-platform/config";

export type ModelTab = "all" | "pending" | "published" | "disabled";

export interface PublishModelInput {
  modelId: string;
  displayName: string;
  displayNameAr: string;
  badge?: AdminBadgeKey | undefined;
  /** Admin override of the displayed brand icon; undefined = auto-detect from `provider`. */
  providerIconKey?: string | undefined;
  tier: "standard" | "premium";
  markupMultiplier: number;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  /** Feature-flag keys from MODEL_CATEGORY_KEYS (@ai-platform/config). */
  categories: string[];
  /** Admin-entered benchmark scores (0-100) keyed by
   *  LEADERBOARD_CATEGORY_KEYS (@ai-platform/config), e.g. copied in from
   *  livebench.ai. Powers ranking within each tab of the chat composer's
   *  model picker (see apps/web/features/chat/lib/model-ranking.ts). */
  categoryScores: Record<string, number>;
  wholesaleCostInputPerM: number;
  wholesaleCostOutputPerM: number;
  rateLimitPerUserDaily?: number | undefined;
  /** Admin-authored behavior rules for this model — layered under the
   *  platform-wide base prompt at request time. Not the old per-conversation
   *  systemPrompt (removed entirely; users never had this control). */
  systemPrompt?: string | undefined;
}

/**
 * apps/web/features/admin/models/hooks/use-models.ts (Phase 8c)
 *
 * Deviation from the phase summary: `models.listAll` already returns
 * every row regardless of status (its own comment says so), which is a
 * strict superset of `models.pending`'s rows. Rather than firing a
 * second query and reconciling two caches after every `sync`/`publish`/
 * `toggleAvailability` mutation, the tab filter is applied client-side
 * over the single `listAll` result — one query, one invalidation target,
 * and the "Pending" tab still shows exactly `pending.status === status`.
 * The catalog is small (one row per model the gateway can serve), so
 * this isn't a pagination-at-scale concern the way `admin.listUsers` is.
 */
export function useModels() {
  const t = useTranslations("admin.modelsPage");
  const [tab, setTab] = useState<ModelTab>("all");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const query = trpc.models.listAll.useQuery();

  const rows = useMemo(() => {
    const all = query.data ?? [];
    const byTab = tab === "all" ? all : all.filter((m) => m.status === tab);
    const term = search.trim().toLowerCase();
    if (!term) return byTab;
    // Matches on the model id (the technical slug, e.g. "gpt-4o"), and
    // both display names — covers what an admin would actually type,
    // whether they remember the gateway id or the human-facing label.
    return byTab.filter((m) =>
      m.id.toLowerCase().includes(term) ||
      m.displayName.toLowerCase().includes(term) ||
      m.displayNameAr.toLowerCase().includes(term)
    );
  }, [query.data, tab, search]);

  const pendingCount = useMemo(() => (query.data ?? []).filter((m) => m.status === "pending").length, [query.data]);

  const invalidate = () => utils.models.listAll.invalidate();

  const sync = trpc.models.sync.useMutation({
    onSuccess: (result) => {
      invalidate();
      toast.success(
        t("syncResult", {
          discovered: result.discovered.length,
          deactivated: result.deactivated.length,
          pending: result.stillPending,
        })
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const publish = trpc.models.publish.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const toggleAvailability = trpc.models.toggleAvailability.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  return {
    tab,
    setTab,
    search,
    setSearch,
    rows,
    pendingCount,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    sync: () => sync.mutateAsync(),
    isSyncing: sync.isPending,
    publish: (input: PublishModelInput) => publish.mutateAsync(input),
    isPublishing: publish.isPending,
    publishError: publish.error,
    toggleAvailability: (modelId: string, isAvailable: boolean) =>
      toggleAvailability.mutateAsync({ modelId, isAvailable }),
    isToggling: toggleAvailability.isPending,
  };
}
