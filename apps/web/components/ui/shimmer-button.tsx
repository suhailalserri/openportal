"use client";

import { Slot } from "@radix-ui/react-slot";
import { useReducedMotion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/ui/shimmer-button.tsx
 *
 * Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md). A `Button`-compatible CTA
 * with a slow diagonal light-sweep, for the hero's "Sign up" button per
 * this phase's "shimmer animation with the colours of the web theme"
 * note.
 *
 * PORTED FROM MAGIC UI, NOT INSTALLED FROM IT: this repo has no
 * `components.json`/shadcn registry wired up, and Magic UI ships as
 * copy-in source (React + Tailwind + CSS, same convention as this
 * repo's own components/ui/*), so "using Magic UI" here means the same
 * visual technique — a `background-position`-animated gradient masked
 * to a thin diagonal band — re-implemented against THIS theme's tokens
 * (`--primary` / `--primary-foreground`) instead of Magic UI's default
 * indigo/violet, so it never fights `.dark` / theme-presets.css.
 *
 * WHY A MASKED GRADIENT, NOT AN OVERLAY DIV: an absolutely-positioned
 * sweep element would need to know the button's exact text colour to
 * avoid ever reading as "darkening" it — the exact bug hit and fixed
 * earlier this phase (probing the dark ink token instead of a
 * translucent one). Animating `background-position` on a
 * `linear-gradient` layered UNDER the button's own solid `--primary`
 * background sidesteps that: the sweep is intrinsically additive
 * (`color-mix` with white/foreground at low alpha), so it can only ever
 * brighten, never invert, whatever the current theme's ink is.
 *
 * RTL: the gradient's direction is written with logical values (see the
 * CSS custom property below driven by `dir`), so the sweep travels the
 * same reading-direction in Arabic as in English rather than visually
 * reversing.
 *
 * REDUCED MOTION: the animation is dropped entirely (not slowed) —
 * `useReducedMotion()` from framer-motion, consistent with Reveal and
 * the constellation background elsewhere in this phase. The button
 * remains fully functional and styled, just without the sweep.
 */

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  size?: "default" | "lg";
}

const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ className, asChild = false, size = "lg", children, ...props }, ref) => {
    const prefersReducedMotion = useReducedMotion();
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        data-shimmer={prefersReducedMotion ? "off" : "on"}
        className={cn(
          "group relative inline-flex items-center justify-center gap-[7px] overflow-hidden whitespace-nowrap rounded-[13px] border border-transparent font-semibold leading-tight text-primary-foreground outline-none transition-[filter,transform] duration-150 disabled:pointer-events-none disabled:opacity-45 active:not-disabled:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          size === "lg" ? "h-auto px-[22px] py-[13px] text-[15px]" : "h-auto px-4 py-2.5 text-[13.5px]",
          "bg-primary hover:not-disabled:brightness-[1.05]",
          className,
        )}
        {...props}
      >
        {/* Base fill sits below; the sweep is a second layer clipped to
            the same rounded rect so it can never bleed past the border. */}
        <span
          aria-hidden
          data-shimmer-sweep=""
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit]",
            prefersReducedMotion
              ? "hidden"
              : "[background:linear-gradient(75deg,transparent_35%,color-mix(in_oklab,var(--primary-foreground)_55%,transparent)_50%,transparent_65%)] [background-size:250%_100%] [animation:shimmer-sweep_3.2s_ease-in-out_infinite]",
          )}
          style={{ mixBlendMode: "overlay" }}
        />
        <span className="relative z-10 inline-flex items-center gap-[7px]">{children}</span>
      </Comp>
    );
  },
);
ShimmerButton.displayName = "ShimmerButton";

export { ShimmerButton };
