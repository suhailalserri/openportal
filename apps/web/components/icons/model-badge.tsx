"use client";

import {
  Sparkles,
  Flame,
  ThumbsUp,
  Zap,
  Wallet,
  Crown,
  Brain,
  FlaskConical,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { MODEL_BADGE_KEYS, type ModelBadgeKey } from "@ai-platform/config";
import type { VariantProps } from "class-variance-authority";

/**
 * apps/web/components/icons/model-badge.tsx
 *
 * Renders a model's `badge` column (a MODEL_BADGE_KEYS preset key, see
 * @ai-platform/config/model-metadata.config) as an icon + color chip
 * instead of the raw text/emoji it used to store. Colors are the
 * project's existing semantic tokens (primary/success/warning/destructive/
 * muted — see styles/theme.css) so every preset automatically follows the
 * active theme and light/dark mode, with no hardcoded hex anywhere here.
 *
 * Labels come from `admin.modelsPage.badges.*` (messages/{ar,en}.json) —
 * add a translation there (not here) when adding a preset key.
 */
export const MODEL_BADGE_ICONS: Record<ModelBadgeKey, LucideIcon> = {
  new: Sparkles,
  popular: Flame,
  recommended: ThumbsUp,
  fast: Zap,
  budget: Wallet,
  flagship: Crown,
  smart: Brain,
  beta: FlaskConical,
  deprecated: AlertTriangle,
};

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const MODEL_BADGE_VARIANTS: Record<ModelBadgeKey, BadgeVariant> = {
  new: "info",
  popular: "warning",
  recommended: "success",
  fast: "success",
  budget: "secondary",
  flagship: "default",
  smart: "info",
  beta: "outline",
  deprecated: "destructive",
};

function isModelBadgeKey(value: string | null | undefined): value is ModelBadgeKey {
  return !!value && (MODEL_BADGE_KEYS as readonly string[]).includes(value);
}

export interface ModelBadgeProps {
  badge: string | null | undefined;
  size?: number;
  className?: string;
  /** Render only the icon, no label — used in tight spaces like the chat model chip/list. */
  iconOnly?: boolean;
}

/** Renders nothing when `badge` is empty or not a recognized preset key. */
export function ModelBadge({ badge, size = 12, className, iconOnly = false }: ModelBadgeProps) {
  const t = useTranslations("admin.modelsPage.badges");
  if (!isModelBadgeKey(badge)) return null;

  const Icon = MODEL_BADGE_ICONS[badge];
  const label = t(badge);

  return (
    <Badge variant={MODEL_BADGE_VARIANTS[badge]} className={cn("shrink-0", className)} title={label}>
      <Icon aria-hidden style={{ width: size, height: size }} />
      {!iconOnly && <span>{label}</span>}
    </Badge>
  );
}
