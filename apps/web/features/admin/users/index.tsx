"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import type { DataTableColumn, DataTableLabels } from "@/components/data-table/types";
import { formatDate } from "@/lib/format";
import { useUsersList } from "./hooks/use-users-list";
import { ReferralLeaderboard } from "./components/referral-leaderboard";

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
 * apps/web/features/admin/users/index.tsx (Phase 8b)
 *
 * The real users list, replacing 8a's read-only preview in
 * `features/admin/overview` (that preview stays put — it now has a
 * genuinely working search since this phase fixed `admin.listUsers`,
 * so there's nothing broken to remove, contrary to the phase summary's
 * default; see BRANCH_AND_CI_NOTES.md's 8b entry). This page adds a row
 * click through to `/admin/users/[id]` for the suspend/adjust-credits
 * actions, which live on the detail page rather than as inline row
 * actions — both are typed-confirmation flows (`ConfirmDialog`) that
 * need room for balance context, not a one-click row button.
 */
export function AdminUsersList() {
  const t = useTranslations("admin.usersPage");
  const tTable = useTranslations("admin.dataTable");
  const locale = useLocale();
  const router = useRouter();
  const usersList = useUsersList();

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
    { id: "role", header: t("columns.role"), cell: (row) => <span className="capitalize">{row.role}</span> },
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
      cell: (row) => formatDate(row.createdAt, locale as "ar" | "en"),
      hiddenByDefault: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ReferralLeaderboard />
      <DataTable<UserRow>
        columns={columns}
        rows={usersList.rows}
        getRowId={(row) => row.id}
        labels={labels}
        isLoading={usersList.isLoading}
        isError={usersList.isError}
        onRetry={usersList.refetch}
        onRowClick={(row) => router.push(`/${locale}/admin/users/${row.id}`)}
        search={{ value: usersList.search, onChange: usersList.setSearch, placeholder: t("searchPlaceholder") }}
        pagination={{
          page: usersList.page,
          pageSize: usersList.pageSize,
          hasMore: usersList.hasMore,
          onPageChange: usersList.setPage,
        }}
      />
    </div>
  );
}
