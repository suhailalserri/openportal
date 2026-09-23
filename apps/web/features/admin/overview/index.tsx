"use client";

import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import type { DataTableColumn, DataTableLabels } from "@/components/data-table/types";
import { formatDate } from "@/lib/format";
import { useRecentUsers } from "./hooks/use-recent-users";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  createdAt: string | Date;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "default"> = {
  active: "success",
  suspended: "destructive",
  pending_verification: "default",
};

/**
 * apps/web/features/admin/overview/index.tsx (Phase 8a)
 *
 * The (admin) layout/nav (2.1, AppShell) already exist and already gate
 * this route server-side — this component is only the page BODY that
 * replaces the 2.1 placeholder. It has two jobs: (1) a short landing
 * note (8b-8d land the real sections the nav already lists as
 * "disabled — soon" per `config/nav.ts`), and (2) a live `DataTable`
 * proof-of-wiring against `admin.listUsers`, so 8a's own "Done when"
 * ("table survives reload with filters kept in URL") has something real
 * to check on the Vercel preview rather than only unit tests of the
 * pure URL-state functions.
 *
 * Read-only: no row click, no actions column. Row actions
 * (suspend/adjust credits, via `ConfirmDialog`) are 8b's addition once
 * there's a real destructive/money action to gate — adding a fake one
 * here just to exercise the dialog would be dead code by the time 8b
 * replaces this whole page with the real users list.
 */
export function AdminOverview() {
  const t = useTranslations("admin.overview");
  const tTable = useTranslations("admin.dataTable");
  const locale = useLocale() as "ar" | "en";
  const recentUsers = useRecentUsers();

  const labels: DataTableLabels = {
    search: tTable("search"),
    columns: tTable("columns"),
    rowsPerPage: tTable("rowsPerPage"),
    pageOf: (page) => tTable("pageOf", { page }),
    previous: tTable("previous"),
    next: tTable("next"),
    empty: tTable("empty"),
    error: tTable("error"),
    retry: tTable("retry"),
  };

  const columns: DataTableColumn<UserRow>[] = [
    { id: "email", header: t("columns.email"), cell: (row) => row.email },
    {
      id: "displayName",
      header: t("columns.name"),
      cell: (row) => row.displayName ?? <span className="text-muted-foreground">{t("noName")}</span>,
    },
    {
      id: "role",
      header: t("columns.role"),
      cell: (row) => <span className="capitalize">{row.role}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? "default"}>
          {row.status === "active" || row.status === "suspended" || row.status === "pending_verification"
            ? t(`status.${row.status}`)
            : row.status}
        </Badge>
      ),
    },
    {
      id: "createdAt",
      header: t("columns.joined"),
      cell: (row) => formatDate(row.createdAt, locale),
      align: "end",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[14px] border bg-secondary/40 p-4 text-sm text-muted-foreground">{t("comingSoon")}</div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("recentUsersTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("recentUsersDescription")}</p>
        </div>
        <DataTable
          columns={columns}
          rows={recentUsers.rows as UserRow[]}
          getRowId={(row) => row.id}
          labels={labels}
          isLoading={recentUsers.isLoading}
          isError={recentUsers.isError}
          onRetry={recentUsers.refetch}
          search={{ value: recentUsers.search, onChange: recentUsers.setSearch, placeholder: t("searchPlaceholder") }}
          pagination={{
            page: recentUsers.page,
            pageSize: recentUsers.pageSize,
            hasMore: recentUsers.hasMore,
            onPageChange: recentUsers.setPage,
          }}
        />
      </section>
    </div>
  );
}
