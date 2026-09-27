"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCredits } from "@/lib/format";
import { useReferralLeaderboard } from "../hooks/use-referral-leaderboard";

/**
 * apps/web/features/admin/users/components/referral-leaderboard.tsx
 *
 * "Who brings who" — top referrers across the platform, shown above the
 * users table on /admin/users. Each row links to that referrer's own
 * detail page, where the full list of who they referred (and whether
 * each one has paid and triggered the bonus yet) is visible.
 *
 * Deliberately a top-N summary, not the users table itself — a separate
 * `admin.getReferralLeaderboard` query keeps this panel fast (it only
 * ever fetches users who have referred at least one other user) and
 * independent of the table's own search/pagination state.
 */
export function ReferralLeaderboard() {
  const t = useTranslations("admin.usersPage.referralLeaderboard");
  const locale = useLocale() as "ar" | "en";
  const router = useRouter();
  const { rows, isLoading, isError } = useReferralLeaderboard(10);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{isError ? t("loadError") : t("empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">{t("columns.rank")}</TableHead>
              <TableHead>{t("columns.referrer")}</TableHead>
              <TableHead>{t("columns.code")}</TableHead>
              <TableHead className="text-end">{t("columns.referred")}</TableHead>
              <TableHead className="text-end">{t("columns.paid")}</TableHead>
              <TableHead className="text-end">{t("columns.bonusPaid")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-secondary/40"
                onClick={() => router.push(`/${locale}/admin/users/${row.id}`)}
              >
                <TableCell className="font-semibold text-muted-foreground">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{row.displayName || row.email}</span>
                    {row.displayName ? (
                      <span className="text-xs text-muted-foreground">{row.email}</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {row.referralCode ?? "—"}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">{row.referredCount}</TableCell>
                <TableCell className="text-end">{row.bonusesAwarded}</TableCell>
                <TableCell className="text-end text-success">
                  {formatCredits(row.totalBonusMicroCredits, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
