"use client";

import {
  Eye,
  Image as ImageIcon,
  Mic,
  Video,
  Brain,
  Code2,
  Globe,
  Wrench,
  AlignLeft,
  Sparkles,
  Terminal,
  Sigma,
  BarChart3,
  Languages,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  MODEL_CATEGORY_KEYS,
  LEADERBOARD_CATEGORY_KEYS,
  type ModelCategoryKey,
  type LeaderboardCategoryKey,
} from "@ai-platform/config";

/**
 * apps/web/components/icons/model-category.tsx
 *
 * Icon for each entry in MODEL_CATEGORY_KEYS (@ai-platform/config). Kept
 * separate from model-badge.tsx: a badge is one status label per model,
 * categories are a set of feature flags — different data shape, different
 * rendering (a row of small icons rather than a single chip).
 *
 * Labels come from `admin.modelsPage.categories.*` (messages/{ar,en}.json).
 */
export const MODEL_CATEGORY_ICONS: Record<ModelCategoryKey, LucideIcon> = {
  vision: Eye,
  imageGeneration: ImageIcon,
  audio: Mic,
  video: Video,
  reasoning: Brain,
  coding: Code2,
  webSearch: Globe,
  functionCalling: Wrench,
  longContext: AlignLeft,
};

/**
 * Icon for each entry in LEADERBOARD_CATEGORY_KEYS (@ai-platform/config)
 * — the benchmark-ranking categories, distinct from MODEL_CATEGORY_ICONS
 * above (which are feature flags). Used by the chat composer's model
 * picker for its round category tabs.
 */
export const LEADERBOARD_CATEGORY_ICONS: Record<LeaderboardCategoryKey, LucideIcon> = {
  overall: Sparkles,
  reasoning: Brain,
  coding: Code2,
  agenticCoding: Terminal,
  mathematics: Sigma,
  dataAnalysis: BarChart3,
  language: Languages,
  instructionFollowing: ListChecks,
};

export function isLeaderboardCategoryIconKey(value: string): value is LeaderboardCategoryKey {
  return (LEADERBOARD_CATEGORY_KEYS as readonly string[]).includes(value);
}

function isCategoryKey(value: string): value is ModelCategoryKey {
  return (MODEL_CATEGORY_KEYS as readonly string[]).includes(value);
}

export interface ModelCategoryIconsProps {
  categories: readonly string[] | null | undefined;
  size?: number;
  className?: string;
}

/** Read-only row of small icons for a model's categories — e.g. the admin table. */
export function ModelCategoryIcons({ categories, size = 14, className }: ModelCategoryIconsProps) {
  const t = useTranslations("admin.modelsPage.categories");
  const known = (categories ?? []).filter(isCategoryKey);
  if (known.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1 text-muted-foreground", className)}>
      {known.map((key) => {
        const Icon = MODEL_CATEGORY_ICONS[key];
        return (
          <span
            key={key}
            title={t(key)}
            className="flex items-center justify-center rounded-md bg-secondary p-1"
          >
            <Icon aria-hidden style={{ width: size, height: size }} />
          </span>
        );
      })}
    </div>
  );
}
