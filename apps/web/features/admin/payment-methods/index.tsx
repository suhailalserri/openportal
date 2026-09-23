"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethodRow } from "./types";
import { usePaymentMethods } from "./hooks/use-payment-methods";
import { useSavePaymentMethod, type PaymentMethodFormValues } from "./hooks/use-save-payment-method";

const EMPTY_FORM: PaymentMethodFormValues = {
  name: "", nameAr: "", type: "manual_transfer", logoUrl: "", accountCode: "",
  instructions: "", instructionsAr: "", sortOrder: 0,
};

/**
 * apps/web/features/admin/payment-methods/index.tsx (Phase 8b)
 *
 * NOTE: not part of the Batch2 handoff — the hooks (`use-payment-
 * methods.ts`, `use-save-payment-method.ts`) existed but this component
 * didn't, so the /admin/payment-methods route had no UI to render. Built
 * here, deliberately mirroring `../packages/index.tsx` (same CRUD =
 * create/edit/activate-deactivate shape, no delete procedure) so the two
 * screens stay visually and behaviorally consistent. Not verified with
 * `tsc`/a real browser — see the phase notes for what to check in CI.
 *
 * One real difference from the packages form: `type` (jaib_voucher /
 * manual_transfer) can only be set on create — `updatePaymentMethod`'s
 * input schema has no `type` field (apps/api/src/routers/admin.router.ts),
 * so the select is disabled once editing an existing row rather than
 * silently sending a change that the server would ignore.
 */
export function AdminPaymentMethods() {
  const t = useTranslations("admin.paymentMethodsPage");
  const locale = useLocale() as "ar" | "en";
  const { methods, isLoading, isError, refetch } = usePaymentMethods();
  const save = useSavePaymentMethod();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentMethodFormValues>(EMPTY_FORM);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(method: PaymentMethodRow) {
    setEditingId(method.id);
    setForm({
      name: method.name,
      nameAr: method.nameAr,
      type: method.type,
      logoUrl: method.logoUrl ?? "",
      accountCode: method.accountCode ?? "",
      instructions: method.instructions ?? "",
      instructionsAr: method.instructionsAr ?? "",
      sortOrder: method.sortOrder,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editingId) {
        const { type: _type, ...rest } = form;
        await save.update(editingId, rest);
      } else {
        await save.create(form);
      }
      setDialogOpen(false);
      toast.success(t("saved"));
    } catch {
      // error toast already fired by the hook's onError
    }
  }

  async function handleToggleActive(method: PaymentMethodRow) {
    try {
      await save.setActive(method.id, !method.isActive);
    } catch {
      // error toast already fired by the hook's onError
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>{t("loadError")}</p>
        <Button variant="outline" onClick={refetch}>{t("retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>{t("newMethod")}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead>{t("columns.type")}</TableHead>
            <TableHead>{t("columns.accountCode")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead className="text-end">{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {methods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          ) : (
            methods.map((method) => (
              <TableRow key={method.id}>
                <TableCell>{locale === "ar" ? method.nameAr : method.name}</TableCell>
                <TableCell>{t(`types.${method.type}` as "types.jaib_voucher")}</TableCell>
                <TableCell className="font-mono text-xs">{method.accountCode ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={method.isActive ? "success" : "default"}>
                    {method.isActive ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex items-center justify-end gap-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(method)}>{t("edit")}</Button>
                    <Switch checked={method.isActive} onCheckedChange={() => void handleToggleActive(method)} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={(open) => !save.isPending && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? t("editMethod") : t("newMethod")}</DialogTitle>
            <DialogDescription>{t("formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("form.name")}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label={t("form.nameAr")}>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" />
            </Field>
            <Field label={t("form.type")} className="col-span-2">
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as PaymentMethodFormValues["type"] }))}
                disabled={editingId !== null}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jaib_voucher">{t("types.jaib_voucher")}</SelectItem>
                  <SelectItem value="manual_transfer">{t("types.manual_transfer")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("form.accountCode")} className="col-span-2">
              <Input
                value={form.accountCode}
                onChange={(e) => setForm((f) => ({ ...f, accountCode: e.target.value }))}
              />
            </Field>
            <Field label={t("form.logoUrl")} className="col-span-2">
              <Input value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} />
            </Field>
            <Field label={t("form.sortOrder")}>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </Field>
            <Field label={t("form.instructions")} className="col-span-2">
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              />
            </Field>
            <Field label={t("form.instructionsAr")} className="col-span-2">
              <Textarea
                value={form.instructionsAr}
                onChange={(e) => setForm((f) => ({ ...f, instructionsAr: e.target.value }))}
                dir="rtl"
              />
            </Field>
          </div>

          {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => void handleSave()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
