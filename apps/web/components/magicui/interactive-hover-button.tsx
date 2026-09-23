"use client";

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/interactive-hover-button.tsx
 *
 * Magic UI "Interactive Hover Button" —
 * https://magicui.design/docs/components/interactive-hover-button
 * (MIT, © Magic UI). Adapted for this repo:
 *
 *  1. Pure CSS transitions instead of Framer Motion. The registry version
 *     uses `motion` for the dot -> arrow handoff; it's a two-state
 *     transition driven entirely by `:hover`, so CSS handles it without a
 *     client component at all. The `"use client"` above is kept only so
 *     lucide's `ArrowRight` icon ships in the client bundle alongside the
 *     other hover interactions on the page — the component itself has no
 *     hooks and would work as a server component if you strip the icon.
 *  2. Theme tokens only. The dot is `--primary`, the ring is
 *     `--primary-foreground`, the button chrome is `--card` / `--border`
 *     / `--foreground`. MagicUI's version hardcodes white/black.
 *  3. Reduced motion: the whole interaction is a CSS transition, so it
 *     already obeys theme.css's global `transition-duration: 0.01ms`
 *     override. No `useReducedMotion()` needed — under reduced motion
 *     the button just ends up in its hover state instantly instead of
 *     growing into it.
 *
 * The animation: the left dot grows to fill the button on hover, the
 * text slides right, and an arrow slides in from the right. All three
 * are `group-hover:` classes — no JS state.
 *
 * No styles/index.css additions required.
 */

export interface InteractiveHoverButtonProps
  extends React.ComponentPropsWithoutRef<"button"> {
  children: React.ReactNode;
  className?: string;
}

export function InteractiveHoverButton({
  children,
  className,
  ...props
}: InteractiveHoverButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "group relative cursor-pointer overflow-hidden",
        "rounded-[var(--radius-md)] border border-border bg-card px-6 py-2.5",
        "text-sm font-medium text-foreground",
        "transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      {/* Left dot -> fills the button on hover */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute start-1 top-1/2 size-2 -translate-y-1/2 rounded-full",
          "bg-primary transition-all duration-[var(--duration-slow)] ease-[var(--ease-standard)]",
          "group-hover:start-0 group-hover:top-0 group-hover:size-full group-hover:translate-y-0 group-hover:rounded-[var(--radius-md)]",
        )}
      />

      {/* Content: text slides right, arrow slides in */}
      <span className="relative z-10 flex items-center justify-center gap-2">
        <span
          className={cn(
            "transition-transform duration-[var(--duration-slow)] ease-[var(--ease-standard)]",
            "group-hover:translate-x-3 rtl:group-hover:-translate-x-3",
          )}
        >
          {children}
        </span>

        <ArrowRight
          aria-hidden="true"
          className={cn(
            "size-4 -translate-x-4 opacity-0 rtl:translate-x-4 rtl:-scale-x-100",
            "transition-all duration-[var(--duration-slow)] ease-[var(--ease-standard)]",
            "group-hover:translate-x-1 rtl:group-hover:-translate-x-1 group-hover:opacity-100",
            // On hover the fill is primary, so the arrow + text need the
            // paired foreground to stay legible. `currentColor` keeps this
            // a single class change rather than a colour swap.
            "text-primary-foreground",
          )}
        />

        {/* The label needs to inherit the same foreground once the fill
            takes over. Wrapping it lets the group-hover colour transition
            apply to both the text and arrow in one rule. */}
      </span>

      {/* Foreground colour swap, applied at the group level via a
          pseudo-element-free trick: a full-size overlay that only
          becomes transparent on hover. This keeps `currentColor` on the
          text/arrow so the two-target transition stays one rule. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-20 rounded-[inherit]",
          "transition-colors duration-[var(--duration-slow)] ease-[var(--ease-standard)]",
          "group-hover:bg-primary",
        )}
        style={{ mixBlendMode: "multiply" }}
      />

      {/* Re-expose the label in primary-foreground above the overlay.
          Same text, same position, sits above the multiply layer. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-30 flex items-center justify-center gap-2",
          "text-primary-foreground opacity-0 transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-standard)]",
          "group-hover:opacity-100",
        )}
      >
        <span className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-standard)] group-hover:translate-x-3">
          {children}
        </span>
        <ArrowRight className="size-4 -translate-x-4 opacity-0 transition-all duration-[var(--duration-slow)] ease-[var(--ease-standard)] group-hover:translate-x-1 group-hover:opacity-100" />
      </span>
    </button>
  );
}