"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/welcome-bonus/use-welcome-bonus-admin.ts
 *
 * Loads/saves the welcome-bonus toggle + amount (platform-config.router.ts).
 * Local draft + explicit Save, same reasoning as use-platform-prompt.ts:
 * this moves real money for every new signup the moment it's saved, so a
 * stray click on the switch must not silently go live.
 */
export function useWelcomeBonusAdmin() {
  const t = useTranslations("admin.welcomeBonusPage");
  const utils = trpc.useUtils();
  const query = trpc.platformConfig.getWelcomeBonus.useQuery();

  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState("0");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data && !dirty) {
      setEnabled(query.data.enabled);
      setAmount(String(query.data.amountCredits));
    }
  }, [query.data, dirty]);

  const update = trpc.platformConfig.updateWelcomeBonus.useMutation({
    onSuccess: async () => {
      toast.success(t("saved"));
      setDirty(false);
      await utils.platformConfig.getWelcomeBonus.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save");
    },
  });

  const parsed = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000;
  // An enabled bonus that pays nothing would only confuse users — the
  // server rejects it too; this just disables Save with a hint first.
  const needsAmount = enabled && !(amountValid && parsed > 0);

  return {
    enabled,
    setEnabled: (next: boolean) => { setEnabled(next); setDirty(true); },
    amount,
    setAmount: (next: string) => { setAmount(next); setDirty(true); },
    amountValid,
    needsAmount,
    claimedCount: query.data?.claimedCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save: () => update.mutateAsync({ enabled, amountCredits: Math.round(parsed * 100) / 100 }),
    isSaving: update.isPending,
    canSave: dirty && amountValid && !needsAmount && !update.isPending,
  };
}
