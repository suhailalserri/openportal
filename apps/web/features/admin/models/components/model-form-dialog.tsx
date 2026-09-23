"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PublishModelInput } from "../hooks/use-models";
import type { ModelRow } from "../types";


interface ModelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ModelRow | null;
  onSubmit: (input: PublishModelInput) => Promise<unknown>;
  isPending: boolean;
  errorMessage?: string | undefined;
}

function emptyForm(model: ModelRow | null): PublishModelInput {
  return {
    modelId: model?.id ?? "",
    displayName: model?.displayName ?? "",
    displayNameAr: model?.displayNameAr ?? "",
    badge: model?.badge || undefined,
    tier: (model?.tier === "premium" ? "premium" : "standard"),
    markupMultiplier: model ? Number(model.markupMultiplier) : 2.0,
    contextWindow: model?.contextWindow ?? 0,
    maxOutputTokens: model?.maxOutputTokens ?? 0,
    supportsVision: model?.supportsVision ?? false,
    wholesaleCostInputPerM: model ? Number(model.wholesaleCostInputPerM) : 0,
    wholesaleCostOutputPerM: model ? Number(model.wholesaleCostOutputPerM) : 0,
    rateLimitPerUserDaily: model?.rateLimitPerUserDaily ?? undefined,
  };
}

/**
 * apps/web/features/admin/models/components/model-form-dialog.tsx (Phase 8c)
 *
 * One form for both "publish a pending model" and "edit a published one"
 * — `models.publish` sets status=published regardless of the row's prior
 * status (its own comment: "takes a pending (or previously disabled)
 * model live"), and nothing in the schema stops re-running it on an
 * already-published row, so re-submitting this form is how an admin
 * edits pricing/display info post-publish too. Pre-filled from `model`
 * when editing; blank defaults (tier=standard, markup=2.0) when it's
 * `null` — though in practice this is always opened from a row, never
 * "create from scratch" (there's no procedure for that; rows only come
 * from `models.sync`).
 */
export function ModelFormDialog({ open, onOpenChange, model, onSubmit, isPending, errorMessage }: ModelFormDialogProps) {
  const t = useTranslations("admin.modelsPage.form");
  const [form, setForm] = useState<PublishModelInput>(() => emptyForm(model));

  useEffect(() => {
    if (open) setForm(emptyForm(model));
  }, [open, model]);

  const isValid =
    form.displayName.trim().length > 0 &&
    form.displayNameAr.trim().length > 0 &&
    form.contextWindow > 0 &&
    form.maxOutputTokens > 0 &&
    form.markupMultiplier > 0;

  async function handleSubmit() {
    if (!isValid) return;
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch {
      // Surfaced via errorMessage + the hook's toast; keep the dialog open.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{model?.status === "published" ? t("editTitle") : t("publishTitle")}</DialogTitle>
          <DialogDescription>{form.modelId}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-display-name">{t("displayName")}</Label>
            <Input
              id="model-display-name"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-display-name-ar">{t("displayNameAr")}</Label>
            <Input
              id="model-display-name-ar"
              dir="rtl"
              value={form.displayNameAr}
              onChange={(e) => setForm((f) => ({ ...f, displayNameAr: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-badge">{t("badge")}</Label>
            <Input
              id="model-badge"
              maxLength={10}
              value={form.badge ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value || undefined }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-tier">{t("tier")}</Label>
            <Select value={form.tier} onValueChange={(v) => setForm((f) => ({ ...f, tier: v as "standard" | "premium" }))}>
              <SelectTrigger id="model-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">{t("tierStandard")}</SelectItem>
                <SelectItem value="premium">{t("tierPremium")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-context">{t("contextWindow")}</Label>
            <Input
              id="model-context"
              type="number"
              min={1}
              value={form.contextWindow || ""}
              onChange={(e) => setForm((f) => ({ ...f, contextWindow: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-max-output">{t("maxOutputTokens")}</Label>
            <Input
              id="model-max-output"
              type="number"
              min={1}
              value={form.maxOutputTokens || ""}
              onChange={(e) => setForm((f) => ({ ...f, maxOutputTokens: Number(e.target.value) }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-markup">{t("markupMultiplier")}</Label>
            <Input
              id="model-markup"
              type="number"
              min={0.01}
              step={0.1}
              value={form.markupMultiplier || ""}
              onChange={(e) => setForm((f) => ({ ...f, markupMultiplier: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-rate-limit">{t("rateLimitPerUserDaily")}</Label>
            <Input
              id="model-rate-limit"
              type="number"
              min={1}
              value={form.rateLimitPerUserDaily ?? ""}
              placeholder={t("rateLimitPlaceholder")}
              onChange={(e) =>
                setForm((f) => ({ ...f, rateLimitPerUserDaily: e.target.value ? Number(e.target.value) : undefined }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-cost-in">{t("wholesaleCostInputPerM")}</Label>
            <Input
              id="model-cost-in"
              type="number"
              min={0}
              step={0.01}
              value={form.wholesaleCostInputPerM}
              onChange={(e) => setForm((f) => ({ ...f, wholesaleCostInputPerM: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-cost-out">{t("wholesaleCostOutputPerM")}</Label>
            <Input
              id="model-cost-out"
              type="number"
              min={0}
              step={0.01}
              value={form.wholesaleCostOutputPerM}
              onChange={(e) => setForm((f) => ({ ...f, wholesaleCostOutputPerM: Number(e.target.value) }))}
            />
          </div>

          <div className="flex items-center gap-2.5 sm:col-span-2">
            <Switch
              id="model-vision"
              checked={form.supportsVision}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, supportsVision: checked }))}
            />
            <Label htmlFor="model-vision">{t("supportsVision")}</Label>
          </div>
        </div>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
