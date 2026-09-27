"use client";

import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_BADGE_KEYS, type AdminBadgeKey } from "@ai-platform/config";
import { MODEL_BADGE_ICONS } from "@/components/icons/model-badge";

/**
 * apps/web/features/admin/models/components/model-badge-picker.tsx
 *
 * Replaces the old "type up to 10 chars of text or an emoji" badge input.
 * One preset is selected at a time (or none) — matches how `models.badge`
 * is stored (a single key, "" for none). Every option shows the exact
 * icon it will render as everywhere else in the app
 * (components/icons/model-badge.tsx), so there's no guessing what a
 * preset looks like before saving.
 */
export interface ModelBadgePickerProps {
  value: AdminBadgeKey | undefined;
  onChange: (key: AdminBadgeKey | undefined) => void;
  label: string;
}

export function ModelBadgePicker({ value, onChange, label }: ModelBadgePickerProps) {
  const t = useTranslations("admin.modelsPage.badges");

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-input px-3 py-1.5 text-xs font-medium outline-none transition-colors",
            "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
            value === undefined ? "border-primary bg-accent text-accent-foreground" : "bg-background text-muted-foreground",
          )}
        >
          <Ban aria-hidden className="size-3.5" />
          {t("none")}
        </button>

        {ADMIN_BADGE_KEYS.map((key) => {
          const Icon = MODEL_BADGE_ICONS[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-input px-3 py-1.5 text-xs font-medium outline-none transition-colors",
                "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-accent text-accent-foreground" : "bg-background text-foreground",
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
