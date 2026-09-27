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
  type LucideProps,
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

/**
 * A literal "FREE" wordmark drawn as an SVG, not a Lucide glyph — no
 * built-in icon reads as the word "free" at a glance, and the whole
 * point of this badge is that a user recognizes it as free instantly,
 * the same way $/% icons read instantly for pricing. Sized and stroked
 * like the surrounding Lucide icons (24x24 viewBox, currentColor) so it
 * drops into MODEL_BADGE_ICONS with the same call signature.
 */
function FreeIcon({ size, className, ...props }: LucideProps) {
  return (
    <svg
      viewBox="0 0 34 24"
      width={typeof size === "number" ? size * (34 / 24) : size}
      height={size}
      fill="none"
      className={className}
      {...props}
    >
      <text
        x="17"
        y="16.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fontFamily="inherit"
        letterSpacing="-0.4"
        fill="currentColor"
        stroke="none"
      >
        FREE
      </text>
    </svg>
  );
}

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
  free: FreeIcon as unknown as LucideIcon,
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
  free: "success",
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
  // `free` renders a wordmark, not a square glyph — let it size by height
  // only so its own (wider) aspect ratio isn't squashed into a square box.
  const iconStyle = badge === "free" ? { height: size, width: "auto" } : { width: size, height: size };

  return (
    <Badge variant={MODEL_BADGE_VARIANTS[badge]} className={cn("shrink-0", className)} title={label}>
      <Icon aria-hidden style={iconStyle} />
      {!iconOnly && <span>{label}</span>}
    </Badge>
  );
}
