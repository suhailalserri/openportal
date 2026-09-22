"use client";

import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * apps/web/features/billing/components/pricing-table.tsx (Phase 5.2)
 *
 * `models.list` (public, frozen — apps/api/src/routers/models.router.ts)
 * already returns `creditsPerKInput`/`creditsPerKOutput` pre-computed
 * server-side (`creditsPerK()` there applies markup + `CREDIT_VALUE_USD`
 * conversion) — Rule 1 (money never computed client-side) is satisfied
 * by reading these fields as-is, no client math beyond picking a locale
 * field. Same query `model-picker.tsx` (Phase 4c) already uses for the
 * composer's model dropdown; this is a read-only second consumer.
 */
export function PricingTable() {
  const t = useTranslations("billing.pricing");
  const locale = useLocale() as "ar" | "en";
  const { data, isPending, isError } = trpc.models.list.useQuery();

  if (isPending) {
    return <Skeleton className="h-64 w-full rounded-[14px]" />;
  }

  if (isError || !data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("model")}</TableHead>
            <TableHead>{t("tier")}</TableHead>
            <TableHead className="text-end">{t("inputPer1k")}</TableHead>
            <TableHead className="text-end">{t("outputPer1k")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((model) => (
            <TableRow key={model.id}>
              <TableCell className="flex items-center gap-2 font-medium">
                {locale === "ar" ? model.displayNameAr : model.displayName}
                {model.badge ? <Badge variant="info">{model.badge}</Badge> : null}
              </TableCell>
              <TableCell className="capitalize text-muted-foreground">{model.tier}</TableCell>
              <TableCell className="text-end tabular-nums">{model.creditsPerKInput}</TableCell>
              <TableCell className="text-end tabular-nums">{model.creditsPerKOutput}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
