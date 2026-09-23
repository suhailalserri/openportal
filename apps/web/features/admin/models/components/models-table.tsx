"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ModelRow } from "../types";

const STATUS_VARIANT: Record<string, "success" | "destructive" | "default"> = {
  published: "success",
  pending:   "default",
  disabled:  "destructive",
};

interface ModelsTableProps {
  rows: ModelRow[];
  onEdit: (row: ModelRow) => void;
  onToggle: (row: ModelRow, next: boolean) => void;
  isToggling: boolean;
}

/**
 * apps/web/features/admin/models/components/models-table.tsx (Phase 8c)
 *
 * `isAvailable` switch is separate from `status` on purpose (matches the
 * schema comment on `models.ts`): a pending model has no switch (it
 * isn't published yet — `Publish` is the only action), a published model
 * can be hidden without losing its pricing/display config.
 */
export function ModelsTable({ rows, onEdit, onToggle, isToggling }: ModelsTableProps) {
  const t = useTranslations("admin.modelsPage");

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.model")}</TableHead>
            <TableHead>{t("columns.provider")}</TableHead>
            <TableHead>{t("columns.tier")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead className="text-end">{t("columns.available")}</TableHead>
            <TableHead className="text-end">{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{row.displayName || row.id}</span>
                    <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
                  </div>
                </TableCell>
                <TableCell>{row.provider}</TableCell>
                <TableCell className="capitalize">{row.tier}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status] ?? "default"}>{t(`status.${row.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-end">
                  {row.status === "published" ? (
                    <Switch
                      checked={row.isAvailable}
                      disabled={isToggling}
                      onCheckedChange={(checked) => onToggle(row, checked)}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <Button size="sm" variant="secondary" onClick={() => onEdit(row)}>
                    {row.status === "published" ? t("edit") : t("publish")}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
