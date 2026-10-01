"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAvailability } from "@/features/chat/hooks/use-availability";
import type { FeatureKey } from "./draft";
import { useFeaturesAdmin } from "./use-features-admin";

const KEYS: FeatureKey[] = ["attachments", "voice", "thinking"];

const READINESS_PATH: Partial<Record<FeatureKey, string>> = {
  attachments: "/api/attachments/status",
  voice: "/api/voice/status",
};

/**
 * P6.3e. Whether the BACKEND behind a switch is ready, checked live from this browser through the same
 * status route the chat uses. A switch can be on while this says "not ready": users then see a disabled
 * button, so read this line before saving a switch.
 */
function ReadinessLine({ feature, path }: { feature: "attachments" | "voice"; path: string }) {
  const t = useTranslations("admin.featuresPage.readiness");
  const { state, recheck } = useAvailability(path, true, { strict: true });

  let text: string;
  let tone = "text-muted-foreground";
  if (state.phase === "checking") text = t("checking");
  else if (state.phase === "ready") {
    text = t("ready");
    tone = "text-success";
  } else {
    tone = "text-destructive";
    if (state.reason === "notConfigured") text = t(feature === "voice" ? "notConfiguredVoice" : "notConfiguredAttachments");
    else if (state.reason === "signedOut") text = t("signedOut");
    else text = t("unreachable", { code: state.code });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="status" className={`text-[12.5px] leading-relaxed ${tone}`}>{text}</p>
      {state.phase !== "checking" ? (
        <button type="button" onClick={recheck} className="text-[12.5px] font-medium underline-offset-2 hover:underline">
          {t("recheck")}
        </button>
      ) : null}
    </div>
  );
}

function FeatureRow({ id, feature, checked, onChange }: {
  id: string;
  feature: FeatureKey;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("admin.featuresPage");
  const path = READINESS_PATH[feature];
  return (
    <div className="flex items-start justify-between gap-4 rounded-[14px] border p-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{t(`${feature}.label`)}</Label>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t(`${feature}.hint`)}</p>
        {path && (feature === "attachments" || feature === "voice") ? <ReadinessLine feature={feature} path={path} /> : null}
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
