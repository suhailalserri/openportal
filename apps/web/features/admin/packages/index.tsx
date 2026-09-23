"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCredits, formatYer, microToCredits } from "@/lib/format";
import type { CreditPackage } from "@ai-platform/db";
import { usePackages } from "./hooks/use-packages";
import { useSavePackage, type PackageFormValues } from "./hooks/use-save-package";

const EMPTY_FORM: PackageFormValues = {
  name: "", nameAr: "", priceYer: 0, priceUsdEquivalent: 0, credits: 0,
  description: "", descriptionAr: "", sortOrder: 0,
};

/**
 * apps/web/features/admin/packages/index.tsx (Phase 8b)
 *
 * CRUD = create/edit/activate-deactivate (phase summary point 2 — there
 * is no `deletePackage` procedure). A row's Edit button opens the same
 * form dialog as "New package", pre-filled; `microToCredits` (added to
 * `lib/format.ts` in batch 1 for exactly this) converts the stored
 * micro-credits back to a whole-credit number for the input.
 *
 * Deactivating is a plain `isActive` toggle, not behind `ConfirmDialog`
 * — unlike suspend/adjust-credits it's fully reversible and touches no
 * money already moved, so the extra friction isn't warranted here.
 */
export function AdminPackages() {
  const t = useTranslations("admin.packagesPage");
  const locale = useLocale() as "ar" | "en";
  const { packages, isLoading, isError, refetch } = usePackages();
  const save = useSavePackage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageFormValues>(EMPTY_FORM);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(pkg: CreditPackage) {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      nameAr: pkg.nameAr,
      priceYer: pkg.priceYer,
      priceUsdEquivalent: Number(pkg.priceUsdEquivalent),
      credits: microToCredits(pkg.credits),
      description: pkg.description ?? "",
      descriptionAr: pkg.descriptionAr ?? "",
      sortOrder: pkg.sortOrder,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editingId) {
        await save.update(editingId, form);
      } else {
        await save.create(form);
      }
      setDialogOpen(false);
      toast.success(t("saved"));
    } catch {
      // error toast already fired by the hook's onError
    }
  }

  async function handleToggleActive(pkg: CreditPackage) {
    try {
      await save.setActive(pkg.id, !pkg.isActive);
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
        <Button onClick={openCreate}>{t("newPackage")}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead>{t("columns.price")}</TableHead>
            <TableHead>{t("columns.credits")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead className="text-end">{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          ) : (
            packages.map((pkg) => (
              <TableRow key={pkg.id}>
                <TableCell>{locale === "ar" ? pkg.nameAr : pkg.name}</TableCell>
                <TableCell>{formatYer(pkg.priceYer, locale)} {t("yer")}</TableCell>
                <TableCell>{formatCredits(pkg.credits, locale)}</TableCell>
                <TableCell>
                  <Badge variant={pkg.isActive ? "success" : "default"}>
                    {pkg.isActive ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex items-center justify-end gap-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(pkg)}>{t("edit")}</Button>
                    <Switch checked={pkg.isActive} onCheckedChange={() => void handleToggleActive(pkg)} />
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
            <DialogTitle>{editingId ? t("editPackage") : t("newPackage")}</DialogTitle>
            <DialogDescription>{t("formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("form.name")}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label={t("form.nameAr")}>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" />
            </Field>
            <Field label={t("form.priceYer")}>
              <Input
                type="number"
                value={form.priceYer}
                onChange={(e) => setForm((f) => ({ ...f, priceYer: Number(e.target.value) }))}
              />
            </Field>
            <Field label={t("form.priceUsd")}>
              <Input
                type="number"
                step="0.01"
                value={form.priceUsdEquivalent}
                onChange={(e) => setForm((f) => ({ ...f, priceUsdEquivalent: Number(e.target.value) }))}
              />
            </Field>
            <Field label={t("form.credits")}>
              <Input
                type="number"
                value={form.credits}
                onChange={(e) => setForm((f) => ({ ...f, credits: Number(e.target.value) }))}
              />
            </Field>
            <Field label={t("form.sortOrder")}>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </Field>
            <Field label={t("form.description")} className="col-span-2">
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>
            <Field label={t("form.descriptionAr")} className="col-span-2">
              <Textarea
                value={form.descriptionAr}
                onChange={(e) => setForm((f) => ({ ...f, descriptionAr: e.target.value }))}
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
