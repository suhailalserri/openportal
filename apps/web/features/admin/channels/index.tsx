"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useChannels } from "./hooks/use-channels";

/**
 * apps/web/features/admin/channels/index.tsx (Phase 8c)
 *
 * Read-only, per the plan ("channels (read-only health)") — New API is
 * the source of truth for channel config; nothing here writes back to
 * it. `gatewayChannels`'s own comment notes GATEWAY_ROOT_TOKEN
 * authorization can vary by deployment (New API `/api/*` vs `/v1/*`
 * token expectations) — a BAD_GATEWAY error surfaces that message
 * verbatim rather than a generic failure, since it's actionable
 * (check the token type) and this is the one page that would ever
 * show it.
 */
export function AdminChannels() {
  const t = useTranslations("admin.channelsPage");
  const channels = useChannels();

  if (channels.isLoading) {
    return <Skeleton className="h-96 w-full rounded-[14px]" />;
  }

  if (channels.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p className="max-w-md text-center">{channels.errorMessage || t("loadError")}</p>
        <Button variant="outline" onClick={channels.refetch}>{t("retry")}</Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead>{t("columns.type")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead className="text-end">{t("columns.responseTime")}</TableHead>
            <TableHead>{t("columns.models")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          ) : (
            channels.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 1 ? "success" : "destructive"}>
                    {row.status === 1 ? t("statusEnabled") : t("statusDisabled")}
                  </Badge>
                </TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">
                  {row.responseTime > 0 ? t("msValue", { ms: row.responseTime }) : "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={row.models.join(", ")}>
                  {row.models.length > 0 ? t("modelCount", { count: row.models.length }) : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
