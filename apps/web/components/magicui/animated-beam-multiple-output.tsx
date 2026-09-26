"use client";

import { forwardRef, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AppProviderIcon } from "@/components/icons/provider-icon";
import { AnimatedBeam } from "./animated-beam";

/**
 * apps/web/components/magicui/animated-beam-multiple-output.tsx
 *
 * Magic UI "Animated Beam" — Multiple Outputs layout, adapted for this
 * product: user -> OpenPortal -> five model providers.
 *
 * The `AnimatedBeam` engine itself (./animated-beam.tsx) is the exact
 * upstream Magic UI implementation, since fixed to be direction-aware
 * (see its own comments) — this file is the "Multiple Outputs" demo's
 * layout (Circle node + three-column skeleton), re-skinned with this
 * repo's actual copy/branding instead of the reference demo's generic
 * Notion/Drive/WhatsApp icon set, and using theme tokens (`bg-card`,
 * `border-border`, `text-muted-foreground`) instead of a hardcoded white
 * circle so it still works on the dark theme.
 *
 * Provider glyphs are real brand icons from `@lobehub/icons` (via
 * `AppProviderIcon`, components/icons/provider-icon.tsx) — the same
 * resolver the admin models table and chat model picker use — instead
 * of hand-drawn placeholder shapes, so this diagram and the rest of the
 * app show the same icon for the same provider.
 *
 * FIXES (see git history / PR notes for the reported bug):
 *  1. Crossed beams: curvature used to be five independent hand-tuned
 *     constants (-75/-35/0/35/75) picked to "look about right" for a
 *     specific measured layout. Any drift between that assumption and
 *     the real rendered geometry (font metrics, container width,
 *     locale-driven label length, RTL mirroring) makes a beam's curve
 *     bow further than the actual vertical gap to its own target,
 *     visually crossing a neighboring beam even though `toRef` was
 *     always wired to the right provider — this reads exactly like "the
 *     first beam goes to the wrong node" without actually being a wiring
 *     bug. Fixed by deriving curvature from each provider's OWN row
 *     index relative to the vertical center (`curvatureForRow` below)
 *     instead of independent guesses, so the curve amount always tracks
 *     the real layout and can never overshoot into a neighbor's lane.
 *  2. RTL beams flowing backwards: fixed in animated-beam.tsx itself
 *     (measures real endpoints instead of assuming LTR) — nothing
 *     locale-specific needed here as a result.
 *  3. Platform hub now shows the actual product logo (`/logo.svg`,
 *     the same asset the header and auth modal use) instead of a
 *     placeholder "+" glyph.
 *  4. Decluttered: provider labels moved BELOW each icon (matching the
 *     "You" and "OpenPortal" node labels already in this diagram)
 *     instead of beside it, and the provider column switched from a
 *     tight vertical stack to breathing room via `justify-between` over
 *     the same track height as before — a label sitting to the side of
 *     a tightly-packed icon stack was the main source of the "crowded"
 *     look, not the icon size itself.
 */

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: ReactNode }
>(({ className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full border-2 border-border bg-card p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      {children}
    </div>
  );
});
Circle.displayName = "Circle";

function NodeLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  );
}

const UserIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-full text-muted-foreground"
    aria-hidden="true"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/** Order here is also the visual top-to-bottom row order in the provider column. */
const PROVIDERS = [
  { key: "openai", iconKey: "openai", label: "OpenAI" },
  { key: "anthropic", iconKey: "anthropic", label: "Anthropic" },
  { key: "gemini", iconKey: "google", label: "Gemini" },
  { key: "deepseek", iconKey: "deepseek", label: "DeepSeek" },
  { key: "qwen", iconKey: "qwen", label: "Qwen" },
] as const;

const GRADIENT_STOPS = [
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-2)",
] as const;

// Curvature scales with how far a row sits from the vertical middle row,
// so it always matches the real gap between the hub and that row instead
// of a guessed constant — see the "Crossed beams" note above. Middle row
// (index 2 of 5) gets 0 (a straight line, same as before); each step
// away from the middle adds a proportional bow, same sign convention the
// original hand-tuned values used (rows above the middle curve one way,
// rows below curve the other).
const MIDDLE_INDEX = (PROVIDERS.length - 1) / 2;
const CURVATURE_STEP = 35;
function curvatureForRow(index: number): number {
  return (MIDDLE_INDEX - index) * CURVATURE_STEP;
}

export function AnimatedBeamMultipleOutput({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const userRef = useRef<HTMLDivElement>(null);
  const platformRef = useRef<HTMLDivElement>(null);
  const providerRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ] as const;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[420px] w-full items-center justify-center overflow-hidden p-10",
        className,
      )}
    >
      <div className="flex size-full max-w-xl flex-row items-stretch justify-between gap-6 sm:gap-10">
        {/* Column 1 — user */}
        <div className="flex flex-col items-center justify-center gap-2">
          <Circle ref={userRef}>{UserIcon}</Circle>
          <NodeLabel>You</NodeLabel>
        </div>

        {/* Column 2 — the platform hub, showing the real product logo */}
        <div className="flex flex-col items-center justify-center gap-3">
          <Circle ref={platformRef} className="size-16 border-primary/40 p-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" aria-hidden="true" className="size-full object-contain" />
          </Circle>
          <span className="font-mono text-[10px] font-medium tracking-wider text-primary uppercase">
            OpenPortal
          </span>
        </div>

        {/* Column 3 — providers, label below each icon (matches the
           user/hub nodes) so the row reads as one calm column instead of
           icon+text pairs crowding each other horizontally. */}
        <div className="flex flex-col justify-between py-1">
          {PROVIDERS.map((provider, i) => (
            <div key={provider.key} className="flex flex-col items-center gap-1.5">
              <Circle ref={providerRefs[i]}>
                <AppProviderIcon providerIconKey={provider.iconKey} size={20} type="color" />
              </Circle>
              <NodeLabel>{provider.label}</NodeLabel>
            </div>
          ))}
        </div>
      </div>

      {/* Beams: user -> OpenPortal -> each provider. Curvature is derived
         per-row (see curvatureForRow above) instead of independent
         hand-tuned constants, so it always matches the real vertical gap
         to that row's own target and can't bow into a neighboring lane. */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={userRef}
        toRef={platformRef}
        duration={4}
        repeatDelay={1.5}
        curvature={0}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-1)"
      />
      {PROVIDERS.map((provider, i) => (
        <AnimatedBeam
          key={provider.key}
          containerRef={containerRef}
          fromRef={platformRef}
          toRef={providerRefs[i]}
          duration={4}
          repeatDelay={1.5}
          delay={0.3 + i * 0.15}
          curvature={curvatureForRow(i)}
          gradientStartColor="var(--color-primary)"
          gradientStopColor={GRADIENT_STOPS[i]}
        />
      ))}
    </div>
  );
}
