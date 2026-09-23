import { type ComponentPropsWithoutRef, type CSSProperties, type FC } from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/animated-shiny-text.tsx
 *
 * Magic UI "Animated Shiny Text" —
 * https://magicui.design/docs/components/animated-shiny-text (MIT,
 * © Magic UI). Copied from `https://magicui.design/r/animated-shiny-text.json`.
 *
 * Adaptations for this repo:
 *
 *  1. neutral-* colours became theme tokens (`muted-foreground` /
 *     `foreground`) so it follows light/dark and the theme preset.
 *  2. `mx-auto max-w-md` removed from the base class list. The original
 *     bakes "centered, capped at md" into the component, which every
 *     left-aligned or full-width call site then has to undo. The base
 *     now sets only the text colour and the shine; callers who want
 *     centered/max-md pass it themselves. (Call-site change: any
 *     existing `<AnimatedShinyText>` that relied on the implicit
 *     centering needs `className="mx-auto max-w-md"` — grep first.)
 *  3. Redundant `via-50%` dropped; Tailwind already defaults the via
 *     stop position to 50% when one via colour is present.
 *
 * The `shiny-text` keyframes live in styles/index.css, and the ambient
 * loop already no-ops under `prefers-reduced-motion` via the global
 * override in theme.css.
 */

export interface AnimatedShinyTextProps extends ComponentPropsWithoutRef<"span"> {
  shimmerWidth?: number;
}

export const AnimatedShinyText: FC<AnimatedShinyTextProps> = ({
  children,
  className,
  shimmerWidth = 100,
  ...props
}) => {
  return (
    <span
      style={
        {
          "--shiny-width": `${shimmerWidth}px`,
        } as CSSProperties
      }
      className={cn(
        "text-muted-foreground/70",

        // Shine effect
        "animate-shiny-text bg-size-[var(--shiny-width)_100%] bg-clip-text bg-position-[0_0] bg-no-repeat [transition:background-position_1s_cubic-bezier(.6,.6,0,1)_infinite]",

        // Shine gradient
        "bg-linear-to-r from-transparent via-foreground/80 to-transparent",

        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};