"use client";

import { forwardRef, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "./animated-beam";

/**
 * apps/web/components/magicui/animated-beam-multiple-output.tsx
 *
 * Magic UI "Animated Beam" — Multiple Outputs layout, adapted for this
 * product: user -> OpenPortal -> five model providers.
 *
 * The `AnimatedBeam` engine itself (./animated-beam.tsx) is the exact
 * upstream Magic UI implementation. This file is the "Multiple Outputs"
 * demo's layout (Circle node + three-column skeleton), re-skinned with
 * this repo's actual copy/branding instead of the reference demo's
 * generic Notion/Drive/WhatsApp icon set, and using theme tokens
 * (`bg-card`, `border-border`, `text-muted-foreground`) instead of a
 * hardcoded white circle so it still works on the dark theme.
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

/** Original geometric glyphs — not reproductions of any provider's trademarked logo. */
const ProviderIcon = {
  openai: (
    <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.75" fill="currentColor" />
    </svg>
  ),
  anthropic: (
    <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
      <path
        d="M12 3v18M4.5 8.5 12 12l7.5-3.5M4.5 15.5 12 12l7.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  gemini: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-full" aria-hidden="true">
      <path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z" />
    </svg>
  ),
  deepseek: (
    <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
      <path
        d="M12 3 20 8.5v7L12 21 4 15.5v-7L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  ),
  qwen: (
    <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
} as const;

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

export function AnimatedBeamMultipleOutput({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const userRef = useRef<HTMLDivElement>(null);
  const platformRef = useRef<HTMLDivElement>(null);
  const openaiRef = useRef<HTMLDivElement>(null);
  const anthropicRef = useRef<HTMLDivElement>(null);
  const geminiRef = useRef<HTMLDivElement>(null);
  const deepseekRef = useRef<HTMLDivElement>(null);
  const qwenRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[500px] w-full items-center justify-center overflow-hidden p-10",
        className,
      )}
    >
      <div className="flex size-full max-w-lg flex-row items-stretch justify-between gap-10">
        {/* Column 1 — user */}
        <div className="flex flex-col items-center justify-center gap-2">
          <Circle ref={userRef}>{UserIcon}</Circle>
          <NodeLabel>You</NodeLabel>
        </div>

        {/* Column 2 — the platform hub */}
        <div className="flex flex-col items-center justify-center gap-3">
          <Circle ref={platformRef} className="size-16 border-primary/40">
            <span className="relative block size-7">
              <span
                className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 55%, black))",
                }}
              />
              <span
                className="absolute start-0 top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full opacity-55"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 55%, black))",
                }}
              />
            </span>
          </Circle>
          <span className="font-mono text-[10px] font-medium tracking-wider text-primary uppercase">
            OpenPortal
          </span>
        </div>

        {/* Column 3 — providers */}
        <div className="flex flex-col justify-center gap-2">
          <div className="flex items-center gap-2">
            <Circle ref={openaiRef} className="text-foreground">
              {ProviderIcon.openai}
            </Circle>
            <NodeLabel>OpenAI</NodeLabel>
          </div>
          <div className="flex items-center gap-2">
            <Circle ref={anthropicRef} className="text-foreground">
              {ProviderIcon.anthropic}
            </Circle>
            <NodeLabel>Anthropic</NodeLabel>
          </div>
          <div className="flex items-center gap-2">
            <Circle ref={geminiRef} className="text-foreground">
              {ProviderIcon.gemini}
            </Circle>
            <NodeLabel>Gemini</NodeLabel>
          </div>
          <div className="flex items-center gap-2">
            <Circle ref={deepseekRef} className="text-foreground">
              {ProviderIcon.deepseek}
            </Circle>
            <NodeLabel>DeepSeek</NodeLabel>
          </div>
          <div className="flex items-center gap-2">
            <Circle ref={qwenRef} className="text-foreground">
              {ProviderIcon.qwen}
            </Circle>
            <NodeLabel>Qwen</NodeLabel>
          </div>
        </div>
      </div>

      {/* Beams: user -> OpenPortal -> each provider, fanning out from the
         middle (Gemini) row. Curvature is a direct pixel offset in the
         Magic UI engine (not a multiple of dx), so values are tuned in
         raw px, not fractions. */}
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
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={openaiRef}
        duration={4}
        repeatDelay={1.5}
        delay={0.3}
        curvature={-75}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-2)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={anthropicRef}
        duration={4}
        repeatDelay={1.5}
        delay={0.45}
        curvature={-35}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-3)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={geminiRef}
        duration={4}
        repeatDelay={1.5}
        delay={0.6}
        curvature={0}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-4)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={deepseekRef}
        duration={4}
        repeatDelay={1.5}
        delay={0.75}
        curvature={35}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-5)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={qwenRef}
        duration={4}
        repeatDelay={1.5}
        delay={0.9}
        curvature={75}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-2)"
      />
    </div>
  );
}
