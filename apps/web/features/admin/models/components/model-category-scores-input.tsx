"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEADERBOARD_CATEGORY_KEYS } from "@ai-platform/config";
import { LEADERBOARD_CATEGORY_ICONS } from "@/components/icons/model-category";

/**
 * apps/web/features/admin/models/components/model-category-scores-input.tsx
 *
 * One numeric 0-100 field per LEADERBOARD_CATEGORY_KEYS
 * (@ai-platform/config) entry — Overall, Reasoning, Coding, Agentic
 * Coding, Mathematics, Data Analysis, Language, Instruction Following.
 * The admin is expected to transcribe these from a public benchmark
 * leaderboard (e.g. livebench.ai): open the model's row there, copy each
 * category's score in here. Leaving a field blank is fine — the chat
 * picker's ranking (model-ranking.ts) falls back to the mean of whatever
 * IS filled in for that model, so a partially-scored model still ranks
 * sensibly rather than sinking to the bottom of every tab.
 *
 * Separate component from <ModelCategoryToggles> (the boolean
 * feature-flag chips) on purpose — different data shape (number vs.
 * boolean), different input control (numeric field vs. toggle chip), and
 * conflating the two would make it unclear which list a given key
 * belongs to.
 */
export interface ModelCategoryScoresInputProps {
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  label: string;
}

export function ModelCategoryScoresInput({ value, onChange, label }: ModelCategoryScoresInputProps) {
  const t = useTranslations("admin.modelsPage.leaderboardCategories");

  function setScore(key: string, raw: string) {
    if (raw.trim() === "") {
      const next = { ...value };
      delete next[key];
      onChange(next);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange({ ...value, [key]: n });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <p className="text-[11.5px] text-faint-foreground">{t("scoresHint")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LEADERBOARD_CATEGORY_KEYS.map((key) => {
          const Icon = LEADERBOARD_CATEGORY_ICONS[key];
          const id = `model-score-${key}`;
          return (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon aria-hidden className="size-3.5" />
                {t(key)}
              </Label>
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                step={0.1}
                inputMode="decimal"
                placeholder="—"
                value={value[key] ?? ""}
                onChange={(e) => setScore(key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
