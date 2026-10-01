"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { FeatureKey } from "./draft";
import { useFeaturesAdmin } from "./use-features-admin";

const KEYS: FeatureKey[] = ["attachments", "voice", "thinking"];

function FeatureRow({ id, feature, checked, onChange }: {
  id: string;
  feature: FeatureKey;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("admin.featuresPage");
  return (
    <div className="flex items-start justify-between gap-4 rounded-[14px] border p-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{t(`${feature}.label`)}</Label>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t(`${feature}.hint`)}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * apps/web/features/admin/features/index.tsx
 *
 * (admin)/layout.tsx already ran the role guard; the procedures are adminProcedure on the server.
 * Three switches + Save. A saved switch applies to every user.
 */
export function AdminFeatures() {
  const t = useTranslations("admin.featuresPage");
  const cfg = useFeaturesAdmin();
  const baseId = useId();

  if (cfg.isLoading) return <Skeleton className="h-72 w-full max-w-xl rounded-[14px]" />;

  if (cfg.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>{t("loadError")}</p>
        <Button variant="outline" onClick={() => void cfg.refetch()}>{t("retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="rounded-[14px] border border-warning/40 bg-warning/10 p-3 text-[12.5px] leading-relaxed">
        {t("everyoneWarning")}
      </p>
      {KEYS.map((key) => (
        <FeatureRow
          key={key}
          id={`${baseId}-${key}`}
          feature={key}
          checked={cfg.draft[key]}
          onChange={(next) => cfg.set(key, next)}
        />
      ))}
      <div className="flex justify-end">
        <Button type="button" onClick={() => void cfg.save()} disabled={!cfg.canSave}>
          {cfg.isSaving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
