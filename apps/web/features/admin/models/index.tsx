"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModels, type ModelTab } from "./hooks/use-models";
import { ModelsTable } from "./components/models-table";
import { ModelFormDialog } from "./components/model-form-dialog";
import type { ModelRow } from "./types";

/**
 * apps/web/features/admin/models/index.tsx (Phase 8c)
 *
 * `(admin)/layout.tsx` already ran the role guard (Rule 4) before this
 * renders. Tab filtering, sync, publish/edit, and availability toggle all
 * live in `useModels` — this component only renders states.
 */
export function AdminModels() {
  const t = useTranslations("admin.modelsPage");
  const models = useModels();
  const [editTarget, setEditTarget] = useState<ModelRow | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={models.tab} onValueChange={(v) => models.setTab(v as ModelTab)}>
          <TabsList>
            <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
            <TabsTrigger value="pending">
              {t("tabs.pending")}{models.pendingCount > 0 ? ` (${models.pendingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="published">{t("tabs.published")}</TabsTrigger>
            <TabsTrigger value="disabled">{t("tabs.disabled")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button type="button" variant="outline" size="sm" onClick={() => void models.sync()} disabled={models.isSyncing}>
          <RefreshCw className={models.isSyncing ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
          {models.isSyncing ? t("syncing") : t("sync")}
        </Button>
      </div>

      {models.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[14px]" />
      ) : models.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={models.refetch}>{t("retry")}</Button>
        </div>
      ) : (
        <ModelsTable
          rows={models.rows}
          onEdit={setEditTarget}
          onToggle={(row, next) => void models.toggleAvailability(row.id, next)}
          isToggling={models.isToggling}
        />
      )}

      <ModelFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        model={editTarget}
        onSubmit={models.publish}
        isPending={models.isPublishing}
        errorMessage={models.publishError?.message}
      />
    </div>
  );
}
