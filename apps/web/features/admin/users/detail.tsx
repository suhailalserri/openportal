"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatCredits, formatDate } from "@/lib/format";
import { useSession } from "@/lib/auth-client";
import { useUserDetail } from "./hooks/use-user-detail";
import { useUpdateUserStatus } from "./hooks/use-update-user-status";
import { useAdjustCredits } from "./hooks/use-adjust-credits";

interface Props {
  userId: string;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "default"> = {
  active: "success",
  suspended: "destructive",
  pending_verification: "default",
};

/**
 * apps/web/features/admin/users/detail.tsx (Phase 8b)
 *
 * User detail + the two money/destructive actions the phase summary
 * scoped to this page: suspend/reactivate (`updateUserStatus`) and add/
 * deduct credits (`adjustCredits`). Both route through `ConfirmDialog`'s
 * `requireTypedConfirmation` — reasons documented on each dialog below.
 *
 * Self-suspend guard (point 4 of the phase summary): the server allows
 * an admin to suspend their own account, so this component hides the
 * suspend action entirely when `session.user.id === userId` rather than
 * showing it disabled with an explanation — an admin suspending
 * themselves is never a thing they meant to do from this screen.
 */
export function AdminUserDetail({ userId }: Props) {
  const t = useTranslations("admin.usersPage");
  const locale = useLocale() as "ar" | "en";
  const { data: session } = useSession();
  const detail = useUserDetail(userId);
  const updateStatus = useUpdateUserStatus();
  const adjustCredits = useAdjustCredits();

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState("");
  const [creditsType, setCreditsType] = useState<"admin_credit" | "admin_debit">("admin_credit");
  const [creditsReason, setCreditsReason] = useState("");

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.user) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>{t("detail.loadError")}</p>
        <Button variant="outline" onClick={detail.refetch}>
          {t("detail.retry")}
        </Button>
      </div>
    );
  }

  const { user, balance, recentTxns } = detail;
  const isSelf = session?.user?.id === userId;
  const nextStatus = user.status === "suspended" ? "active" : "suspended";
  const parsedAmount = Number(creditsAmount);
  const amountValid = Number.isInteger(parsedAmount) && parsedAmount > 0;
  const reasonValid = creditsReason.trim().length > 0;

  async function handleConfirmStatus() {
    await updateStatus.updateStatus(userId, nextStatus, suspendReason || undefined);
    setStatusDialogOpen(false);
    setSuspendReason("");
  }

  async function handleConfirmCredits() {
    if (!amountValid || !reasonValid) return;
    await adjustCredits.adjust({ userId, amount: parsedAmount, type: creditsType, reason: creditsReason.trim() });
    setCreditsDialogOpen(false);
    setCreditsAmount("");
    setCreditsReason("");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{user.displayName || user.email}</CardTitle>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[user.status] ?? "default"}>
              {t(`status.${user.status}` as "status.active")}
            </Badge>
            {!isSelf && (
              <Button
                variant={nextStatus === "suspended" ? "destructive" : "outline"}
                onClick={() => setStatusDialogOpen(true)}
              >
                {nextStatus === "suspended" ? t("detail.suspend") : t("detail.reactivate")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("detail.role")}</p>
            <p className="capitalize">{user.role}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("detail.joined")}</p>
            <p>{formatDate(user.createdAt, locale)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("detail.balance")}</p>
            <p>{formatCredits(balance?.credits ?? 0, locale)}</p>
          </div>
          <div className="flex items-end">
            <Button size="sm" variant="outline" onClick={() => setCreditsDialogOpen(true)}>
              {t("detail.adjustCredits")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.recentTxns")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("detail.columns.date")}</TableHead>
                <TableHead>{t("detail.columns.type")}</TableHead>
                <TableHead className="text-end">{t("detail.columns.amount")}</TableHead>
                <TableHead>{t("detail.columns.description")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTxns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("detail.noTxns")}
                  </TableCell>
                </TableRow>
              ) : (
                recentTxns.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>{formatDate(txn.createdAt, locale)}</TableCell>
                    <TableCell className="capitalize">{txn.type.replace(/_/g, " ")}</TableCell>
                    <TableCell className={`text-end ${txn.amount < 0 ? "text-destructive" : "text-success"}`}>
                      {formatCredits(txn.amount, locale)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{txn.description ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Suspend / reactivate — typed confirmation only for the destructive
          direction (suspend). Reactivating a suspended user isn't the
          money/destructive action the phase summary's typed-confirmation
          requirement is about, so it stays a plain confirm. */}
      <ConfirmDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title={nextStatus === "suspended" ? t("detail.suspendTitle") : t("detail.reactivateTitle")}
        description={nextStatus === "suspended" ? t("detail.suspendDescription") : undefined}
        confirmLabel={nextStatus === "suspended" ? t("detail.suspend") : t("detail.reactivate")}
        cancelLabel={t("detail.cancel")}
        destructive={nextStatus === "suspended"}
        isPending={updateStatus.isPending}
        errorMessage={updateStatus.error?.message}
        requireTypedConfirmation={
          nextStatus === "suspended" ? { targetText: user.email, label: t("detail.typeEmailToConfirm") } : undefined
        }
        onConfirm={handleConfirmStatus}
      >
        {nextStatus === "suspended" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="suspend-reason">{t("detail.reason")}</Label>
            <Textarea id="suspend-reason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
          </div>
        )}
      </ConfirmDialog>

      {/* Adjust credits — always typed-confirmation (point 4: no server-
          side idempotency key or cap, so this is the deliberate-friction
          gate). Typing the amount itself, not just any text, so a typo'd
          amount can't slip through on autopilot. */}
      <ConfirmDialog
        open={creditsDialogOpen}
        onOpenChange={setCreditsDialogOpen}
        title={t("detail.adjustCreditsTitle")}
        confirmLabel={t("detail.confirmAdjust")}
        cancelLabel={t("detail.cancel")}
        isPending={adjustCredits.isPending}
        errorMessage={adjustCredits.error?.message}
        confirmDisabled={!amountValid || !reasonValid}
        requireTypedConfirmation={amountValid ? { targetText: creditsAmount, label: t("detail.typeAmountToConfirm") } : undefined}
        onConfirm={handleConfirmCredits}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label>{t("detail.direction")}</Label>
            <Select value={creditsType} onValueChange={(v) => setCreditsType(v as "admin_credit" | "admin_debit")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin_credit">{t("detail.addCredits")}</SelectItem>
                <SelectItem value="admin_debit">{t("detail.deductCredits")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="credits-amount">{t("detail.amountWhole")}</Label>
            <Input
              id="credits-amount"
              inputMode="numeric"
              value={creditsAmount}
              onChange={(e) => setCreditsAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="credits-reason">{t("detail.reason")}</Label>
            <Textarea id="credits-reason" value={creditsReason} onChange={(e) => setCreditsReason(e.target.value)} />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
