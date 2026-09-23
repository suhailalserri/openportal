"use client";

import { useLocale, useTranslations } from "next-intl";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCredits, formatDate } from "@/lib/format";
import { useModelCatalog } from "../hooks/use-model-catalog";
import type { UsageListItem } from "../types";

interface UsageRowDetailProps {
  row: UsageListItem | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * apps/web/features/usage/components/usage-row-detail.tsx (Phase 6.2)
 *
 * Opens as a `Sheet` (side="end" — the default, and correct here per
 * Rule 2: `SheetContent`'s own logic already flips which physical side
 * it slides from based on document direction, so no RTL handling is
 * needed at this call site). `row === null` means closed; the parent
 * (`UsageLogView`) owns that state and clears it on row click / close.
 */
export function UsageRowDetail({ row, onOpenChange }: UsageRowDetailProps) {
  const t = useTranslations("usage.detail");
  const locale = useLocale() as "ar" | "en";
  const { byId } = useModelCatalog();

  const model = row?.modelId ? byId.get(row.modelId) : undefined;
  const modelLabel = row?.modelId ? (model ? (locale === "ar" ? model.displayNameAr : model.displayName) : row.modelId) : t("unknownModel");

  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>
        {row && (
          <dl className="flex flex-col gap-4 px-4 pb-4 text-sm">
            <Row label={t("date")} value={formatDate(row.createdAt, locale)} />
            <Row label={t("model")} value={modelLabel} />
            <Row label={t("cost")} value={formatCredits(-row.amount, locale)} />
            <Row label={t("tokensIn")} value={row.inputTokens?.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { numberingSystem: "latn" }) ?? "—"} />
            <Row label={t("tokensOut")} value={row.outputTokens?.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { numberingSystem: "latn" }) ?? "—"} />
            <Row label={t("requestId")} value={row.requestId ?? "—"} mono />
          </dl>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}
