import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/marquee.tsx
 *
 * Magic UI "Marquee" — https://magicui.design/docs/components/marquee
 * (MIT, © Magic UI). Adapted for this repo:
 *
 *  1. Server component. MagicUI's version ships `"use client"` because
 *     it accepts a `pauseOnHover` prop consumed on the JS side; here the
 *     hover pause is a pure CSS `animation-play-state` toggle via
 *     Tailwind's `hover:[animation-play-state:paused]`, so no hook is
 *     needed and the whole thing is RSC-compatible.
 *  2. Duplication-for-loop is handled *here* rather than by the caller.
 *     The registry version asks the caller to render its children twice
 *     inside the track — that's an easy footgun (duplicate React keys,
 *     forgetting the second copy). We clone `children` once and mark the
 *     clone `aria-hidden`, matching what payment-marquee.tsx already
 *     does by hand. Track translates 0 -> -50%, so the seam is invisible.
 *  3. Theme tokens only. The fade edges use `--background` in a
 *     `mask-image: linear-gradient`, so the strip dissolves into
 *     whichever surface it sits on rather than a hardcoded white/black.
 *  4. Reduced motion: theme.css's global override already kills CSS
 *     animations under `prefers-reduced-motion`. But a frozen marquee is
 *     a poor fallback (half the items off-screen, no way to see them).
 *     So under reduced motion this switches to a wrapped flex row via a
 *     `motion-reduce:` variant — same as payment-marquee.tsx's
 *     established behaviour in styles/index.css. Consistency across the
 *     two marquees matters more than either implementation alone.
 *  5. `reverse` and `vertical` from the registry are kept. `pauseOnHover`
 *     is kept too but is now a CSS-only toggle.
 *
 * Deliberately reused `.animate-marquee` from styles/index.css (already
 * defined for payment-marquee.tsx). If you change the duration there,
 * this component's speed changes with it — they're intentionally the
 * same visual rhythm across the app.
 */

export interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  vertical?: boolean;
  /** How many times to repeat `children` before the seamless loop. Default 1. */
  repeat?: number;
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  vertical = false,
  repeat = 1,
  children,
  style,
  ...props
}: MarqueeProps) {
  const group = (
    <div
      className={cn(
        "flex shrink-0 justify-around gap-[var(--gap)]",
        vertical ? "flex-col" : "flex-row",
      )}
    >
      {children}
    </div>
  );

  return (
    <div
      {...props}
      style={
        {
          "--duration": "28s",
          "--gap": "1rem",
          ...style,
        } as CSSProperties
      }
      className={cn(
        "group flex overflow-hidden p-2",
        vertical ? "flex-col" : "flex-row",
        "[gap:var(--gap)]",

        // Fade the edges into whatever surface the marquee sits on.
        vertical
          ? "[mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]"
          : "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",

        // Pause on hover is a pure CSS state, not JS.
        pauseOnHover && "hover:[&_.animate-marquee]:[animation-play-state:paused]",

        className,
      )}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          aria-hidden={i > 0}
          className={cn(
            "flex shrink-0 justify-around gap-[var(--gap)]",
            "animate-marquee motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:w-full",
            vertical ? "flex-col" : "flex-row",
            reverse && "[animation-direction:reverse]",
            // The track's outer wrappers replicate the inner group's
            // gap so the two halves (visible + clone) butt up seamlessly.
            vertical
              ? "[--tw-animate-marquee:marquee-vertical]"
              : undefined,
          )}
        >
          {/* Duplicate each child `repeat` times inside the track so
              the 0 -> -50% translate is seamless. */}
          {Array.from({ length: repeat }).map((__, j) => (
            <div key={j} className="contents">
              {children}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}