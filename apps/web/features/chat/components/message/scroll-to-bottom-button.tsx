"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface ScrollToBottomButtonProps {
  /** Controls mount/visibility. Kept as a boolean prop (not internal
   *  state) so MessageList's existing `stickToBottomRef` scroll-tracking
   *  stays the single source of truth for "are we at the bottom" — this
   *  component only renders what it's told. */
  visible: boolean;
  onClick: () => void;
  className?: string | undefined;
}

/**
 * apps/web/features/chat/components/message/scroll-to-bottom-button.tsx
 *
 * The floating round "jump to latest" affordance that appears once the
 * viewer has scrolled up away from the live edge of the conversation —
 * same idea as every mainstream chat product's own version of this.
 * Sits absolutely positioned inside MessageList's own `relative`
 * wrapper (see that file), just above the bottom fade so it never
 * overlaps the composer below it.
 *
 * Visual language pulled straight from docs/design/design-preview.html's
 * `.icon-btn`/`.fab`-shaped affordances rather than invented fresh:
 * circular, `bg-card` raised surface, `border-border` hairline, and
 * `shadow-2`-equivalent (`shadow-lg`) so it reads as floating above the
 * transcript instead of sitting flush with it — the same raised-surface
 * treatment the design system already uses for the composer bar itself.
 * Uses `--primary`/`--accent` (the "gate" gold) for the icon so it stays
 * on-theme in both the light and dark token sets without hardcoding a
 * color here.
 */
export function ScrollToBottomButton({ visible, onClick, className }: ScrollToBottomButtonProps) {
  const t = useTranslations("chat");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("scrollToLatest")}
      title={t("scrollToLatest")}
      // `pointer-events-none` while hidden — the fade-out is opacity/
      // translate only, so without this the (invisible) button would
      // still intercept a tap over the last few messages before its
      // `duration-200` transition actually finishes.
      className={cn(
        "absolute bottom-3 start-1/2 z-20 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-accent-foreground shadow-lg transition-all duration-200 hover:bg-muted",
        "rtl:translate-x-1/2",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
        className
      )}
    >
      <ChevronDown className="size-5" />
    </button>
  );
}
