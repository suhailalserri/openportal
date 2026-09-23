import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/pulsating-button.tsx
 *
 * Magic UI "Pulsating Button" —
 * https://magicui.design/docs/components/pulsating-button (MIT, © Magic UI).
 * Adapted for this repo:
 *
 *  1. Server component. The registry version is a client component
 *     because it accepts a `duration` prop consumed by an inline style;
 *     inline style on a plain element works fine in RSC, so no hooks, no
 *     `"use client"`. Keeps it usable inside server-rendered sections.
 *  2. Theme tokens only. Fill is `--primary`, label is
 *     `--primary-foreground`, and the pulsating ring uses
 *     `color-mix(in oklab, var(--primary) 50%, transparent)` so the ring
 *     reads as a soft halo of the button itself instead of a hardcoded
 *     hex that breaks on theme switch. MagicUI hardcodes
 *     `rgba(168,85,247,0.6)`.
 *  3. Reduced motion: the pulsating ring is a CSS animation, so
 *     theme.css's global `animation-duration: 0.01ms` override neutralises
 *     it. The button stays visible; the ring just stops pulsing. No
 *     `useReducedMotion()` needed.
 *
 * Requires in styles/index.css (append near the other MagicUI keyframes):
 *
 *   @keyframes pulse-ring {
 *     0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 50%, transparent); }
 *     70%  { box-shadow: 0 0 0 12px color-mix(in oklab, var(--primary) 0%, transparent); }
 *     100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 0%, transparent); }
 *   }
 *   @theme inline {
 *     --animate-pulse-ring: pulse-ring var(--pulse-duration, 1.6s) cubic-bezier(0.4, 0, 0.6, 1) infinite;
 *   }
 */

export interface PulsatingButtonProps
  extends React.ComponentPropsWithoutRef<"button"> {
  /** Full pulse cycle in ms. Matches the registry prop. Default 1500. */
  pulseDuration?: number;
  /** Distance the pulse ring travels, in px. Default 12. */
  pulseDistance?: number;
  className?: string;
  children: React.ReactNode;
}

export function PulsatingButton({
  pulseDuration = 1500,
  pulseDistance = 12,
  className,
  children,
  style,
  ...props
}: PulsatingButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex items-center justify-center",
        "rounded-[var(--radius-md)] bg-primary px-6 py-2.5",
        "text-sm font-medium text-primary-foreground",
        "animate-pulse-ring",
        "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      style={
        {
          "--pulse-duration": `${pulseDuration}ms`,
          "--pulse-distance": `${pulseDistance}px`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </button>
  );
}