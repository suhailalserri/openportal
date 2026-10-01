"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";

import type { FeatureDraft, FeatureKey } from "./draft";

/**
 * apps/web/features/admin/features/use-features-admin.ts
 *
 * Loads/saves the three feature switches (platform-config.router.ts getFeatures / updateFeatures).
 * Local draft + explicit Save, same reasoning as use-welcome-bonus-admin.ts: a saved switch goes live
 * for EVERY user, so a stray tap must not silently publish a feature.
 */
export function useFeaturesAdmin() {
  const t = useTranslations("admin.featuresPage");
  const utils = trpc.useUtils();
  const query = trpc.platformConfig.getFeatures.useQuery();

  const [draft, setDraft] = useState<FeatureDraft>({ attachments: false, voice: false, thinking: false });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data && !dirty) setDraft({ attachments: query.data.attachments, voice: query.data.voice, thinking: query.data.thinking });
  }, [query.data, dirty]);

  const update = trpc.platformConfig.updateFeatures.useMutation({
    onSuccess: async () => {
      toast.success(t("saved"));
      setDirty(false);
      await utils.platformConfig.getFeatures.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || t("saveError"));
    },
  });

  return {
    draft,
    set: (key: FeatureKey, value: boolean) => {
      setDraft((d) => ({ ...d, [key]: value }));
      setDirty(true);
    },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save: () => update.mutateAsync(draft),
    isSaving: update.isPending,
    canSave: dirty && !update.isPending,
  };
}
