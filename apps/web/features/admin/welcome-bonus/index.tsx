"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useWelcomeBonusAdmin } from "./use-welcome-bonus-admin";

/**
 * apps/web/features/admin/welcome-bonus/index.tsx
 *
 * (admin)/layout.tsx already ran the role guard; the procedures are
 * adminProcedure on the server. One switch + one amount + Save.
 */
function EligibilityCheck({ launchedAt }: { launchedAt: Date | null }) {
  const t = useTranslations("admin.welcomeBonusPage");
  const locale = useLocale();
  const emailId = useId();
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const q = trpc.platformConfig.checkWelcomeBonusUser.useQuery(
    { email },
    { enabled: email.length >= 3, retry: false },
  );
  const fmt = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB", { numberingSystem: "latn" }) : "—";

  const data = q.data;
  const reasonKey = data ? (data.reason ?? "ELIGIBLE") : null;

  return (
    <div className="grid gap-3 rounded-[14px] border p-4">
      <Label htmlFor={emailId}>{t("checkTitle")}</Label>
      <p className="text-[12.5px] text-muted-foreground">
        {t("checkHint", { date: fmt(launchedAt) })}
      </p>
      <div className="flex gap-2">
        <Input
          id={emailId}
          type="email"
          placeholder="user@example.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setEmail(draft.trim()); }}
        />
        <Button type="button" variant="outline" onClick={() => setEmail(draft.trim())} disabled={draft.trim().length < 3}>
          {t("checkButton")}
        </Button>
      </div>
      {q.isFetching ? (
        <p className="text-[12.5px] text-muted-foreground">…</p>
      ) : q.isError ? (
        <p role="alert" className="text-[12.5px] text-destructive">{q.error.message}</p>
      ) : data && reasonKey ? (
        <div className="grid gap-1 text-[12.5px]">
          <p className={reasonKey === "ELIGIBLE" ? "font-medium text-success" : "font-medium text-destructive"}>
            {t(`reasons.${reasonKey}`)}
          </p>
          {data.found ? (
            <p className="text-muted-foreground">
              {t("checkFacts", {
                status: data.status ?? "—",
                created: fmt(data.createdAt),
                claimed: data.claimedAt ? fmt(data.claimedAt) : "—",
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminWelcomeBonus() {
  const t = useTranslations("admin.welcomeBonusPage");
  const cfg = useWelcomeBonusAdmin();
  const switchId = useId();
  const amountId = useId();

  if (cfg.isLoading) return <Skeleton className="h-56 w-full max-w-xl rounded-[14px]" />;

  if (cfg.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>{t("loadError")}</p>
        <Button variant="outline" onClick={() => void cfg.refetch()}>{t("retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4 rounded-[14px] border p-4">
        <div className="grid gap-1">
          <Label htmlFor={switchId}>{t("enabledLabel")}</Label>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("enabledHint")}</p>
        </div>
        <Switch id={switchId} checked={cfg.enabled} onCheckedChange={cfg.setEnabled} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={amountId}>{t("amountLabel")}</Label>
        <Input
          id={amountId}
          type="number"
          inputMode="decimal"
          min={0}
          max={100000}
          step="0.01"
          value={cfg.amount}
          onChange={(e) => cfg.setAmount(e.target.value)}
          aria-invalid={cfg.needsAmount || !cfg.amountValid}
          className="max-w-[220px]"
        />
        <p className="text-[12.5px] text-muted-foreground">{t("amountHint")}</p>
        {cfg.needsAmount ? (
          <p role="alert" className="text-[12.5px] text-destructive">{t("amountRequired")}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-muted-foreground">
          {t("claimedCount", { count: cfg.claimedCount.toLocaleString("en-US") })}
        </span>
        <Button type="button" onClick={() => void cfg.save()} disabled={!cfg.canSave}>
          {cfg.isSaving ? t("saving") : t("save")}
        </Button>
      </div>

      <EligibilityCheck launchedAt={cfg.launchedAt} />
    </div>
  );
}
