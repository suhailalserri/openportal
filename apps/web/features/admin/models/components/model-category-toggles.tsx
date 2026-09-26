"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { MODEL_CATEGORY_KEYS, type ModelCategoryKey } from "@ai-platform/config";
import { MODEL_CATEGORY_ICONS } from "@/components/icons/model-category";

/**
 * apps/web/features/admin/models/components/model-category-toggles.tsx
 *
 * Lets an admin toggle which real-world features a model supports —
 * vision, coding, reasoning, web search, etc. (MODEL_CATEGORY_KEYS,
 * @ai-platform/config) — as a set of chips, the same interaction shape as
 * the pre-existing "Supports image input" switch, just for many flags at
 * once instead of one. Deliberately independent of that switch: this
 * powers model *discovery/organization* (future filtering by category),
 * `supportsVision` stays the one thing the chat composer's image-upload
 * gating actually reads, so nothing there needs to change.
 */
export interface ModelCategoryTogglesProps {
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
}

export function ModelCategoryToggles({ value, onChange, label }: ModelCategoryTogglesProps) {
  const t = useTranslations("admin.modelsPage.categories");

  function toggle(key: ModelCategoryKey) {
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {MODEL_CATEGORY_KEYS.map((key) => {
          const Icon = MODEL_CATEGORY_ICONS[key];
          const selected = value.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-input px-3 py-1.5 text-xs font-medium outline-none transition-colors",
                "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-accent text-accent-foreground" : "bg-background text-muted-foreground",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {t(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
