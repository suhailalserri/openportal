"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformPrompt } from "./use-platform-prompt";

const BASE_PROMPT_MAX = 20_000;

/**
 * apps/web/features/admin/prompt/index.tsx
 *
 * `(admin)/layout.tsx` already ran the role guard before this renders
 * (same pattern as features/admin/models/index.tsx). One textarea + Save:
 * the platform-wide base system prompt, applied ahead of every model's own
 * prompt on every conversation (history-compaction.service.ts's
 * buildSystemPrompt). Per-model additions are edited from the model's own
 * row on /admin/models instead — this page is only the shared base layer.
 */
export function AdminPrompt() {
  const t = useTranslations("admin.promptPage");
  const prompt = usePlatformPrompt();

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-[13px] text-muted-foreground">{t("description")}</p>

      {prompt.isLoading ? (
        <Skeleton className="h-64 w-full rounded-[14px]" />
      ) : prompt.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={() => void prompt.refetch()}>{t("retry")}</Button>
        </div>
      ) : (
        <>
          <Textarea
            value={prompt.draft}
            onChange={(e) => prompt.setDraft(e.target.value)}
            maxLength={BASE_PROMPT_MAX}
            placeholder={t("placeholder")}
            rows={14}
            className="min-h-[320px] resize-y font-mono text-[13px]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-faint-foreground">
              {prompt.draft.length.toLocaleString("en-US")} / {BASE_PROMPT_MAX.toLocaleString("en-US")}
            </span>
            <div className="flex items-center gap-2">
              {prompt.saveError && <span className="text-[12.5px] text-destructive">{prompt.saveError.message}</span>}
              <Button
                type="button"
                onClick={() => void prompt.save()}
                disabled={!prompt.dirty || prompt.isSaving}
              >
                {prompt.isSaving ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
