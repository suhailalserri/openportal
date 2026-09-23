"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate } from "@/lib/format";
import { useFraud } from "./hooks/use-fraud";

const SEVERITY_VARIANT: Record<string, "info" | "warning" | "destructive"> = {
  low: "info",
  medium: "warning",
  high: "destructive",
  critical: "destructive",
};

/**
 * apps/web/features/admin/fraud/index.tsx (Phase 8c)
 *
 * Two distinct actions per row, both requiring confirmation but neither
 * moving money (Rule/8b's typed-confirmation gate is reserved for money
 * and destructive-irreversible actions — this codebase's precedent,
 * `use-manual-payments.ts`'s approve/reject, uses a plain `ConfirmDialog`
 * without `requireTypedConfirmation` for the same reason): "Resolve"
 * marks the event handled (event stays, `resolved=true`); "Clear flag"
 * is on the linked user and un-sets `isFraudFlagged` — kept separate
 * because a single event can be resolved without necessarily clearing
 * the user's flag (multiple events can flag the same user).
 */
export function AdminFraud() {
  const t = useTranslations("admin.fraudPage");
  const tTypes = useTranslations("admin.fraudTypes");
  const locale = useLocale() as "ar" | "en";
  const fraud = useFraud();

  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [clearTarget, setClearTarget] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={fraud.resolved ? "resolved" : "unresolved"} onValueChange={(v) => fraud.setResolved(v === "resolved")}>
        <TabsList>
          <TabsTrigger value="unresolved">{t("tabs.unresolved")}</TabsTrigger>
          <TabsTrigger value="resolved">{t("tabs.resolved")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {fraud.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[14px]" />
      ) : fraud.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={fraud.refetch}>{t("retry")}</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.severity")}</TableHead>
                <TableHead>{t("columns.user")}</TableHead>
                <TableHead>{t("columns.date")}</TableHead>
                {!fraud.resolved && <TableHead className="text-end">{t("columns.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fraud.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">{t("empty")}</TableCell>
                </TableRow>
              ) : (
                fraud.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{tTypes(row.type)}</TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANT[row.severity] ?? "default"}>{t(`severity.${row.severity}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.userId ? (
                        <Link href={`/${locale}/admin/users/${row.userId}`} className="text-primary underline-offset-2 hover:underline">
                          {row.userId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(row.createdAt, locale)}</TableCell>
                    {!fraud.resolved && (
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setResolveTarget(row.id)}>
                            {t("resolve")}
                          </Button>
                          {row.userId && (
                            <Button size="sm" variant="outline" onClick={() => setClearTarget(row.userId!)}>
                              {t("clearFlag")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={resolveTarget !== null}
        onOpenChange={(open) => !open && setResolveTarget(null)}
        title={t("resolveTitle")}
        description={t("resolveDescription")}
        confirmLabel={t("resolve")}
        cancelLabel={t("cancel")}
        isPending={fraud.isResolving}
        onConfirm={async () => {
          if (resolveTarget) await fraud.resolveEvent(resolveTarget);
          setResolveTarget(null);
        }}
      />

      <ConfirmDialog
        open={clearTarget !== null}
        onOpenChange={(open) => !open && setClearTarget(null)}
        title={t("clearFlagTitle")}
        description={t("clearFlagDescription")}
        confirmLabel={t("clearFlag")}
        cancelLabel={t("cancel")}
        isPending={fraud.isClearingFlag}
        onConfirm={async () => {
          if (clearTarget) await fraud.clearFlag(clearTarget);
          setClearTarget(null);
        }}
      />
    </div>
  );
}
