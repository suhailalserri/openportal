"use client";

import { forwardRef, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "./animated-beam";

/**
 * apps/web/components/magicui/animated-beam-multiple-output.tsx
 *
 * Rebuilt from scratch to match Magic UI's own "Animated Beam Multiple
 * Outputs" reference demo — https://magicui.design/docs/components/animated-beam
 * — both in structure (three-column layout, `Circle` node, container
 * sizing) and in visual style (white circle nodes with a soft shadow),
 * rather than the earlier bespoke version this repo had.
 *
 * The only change from the reference demo is *what* sits in each column,
 * to match this product instead of the demo's generic "5 apps -> OpenAI
 * hub -> user" example:
 *
 *     [ user ] ── beam ──▶ [ OpenPortal hub ] ── 5 beams ──▶ [ provider × 5 ]
 *
 * (Same three-column skeleton as the reference, just narrating this
 * product's actual flow: the visitor's request goes into OpenPortal,
 * which fans it out to whichever of the five providers is picked.)
 *
 * Node styling matches the reference demo's `Circle` component exactly
 * (size-12, rounded-full, border-2, shadow-[0_0_20px_-12px_...], white
 * background) — swapped from a literal `bg-white` to `bg-card` so it
 * still adapts to this repo's dark theme instead of always being white.
 *
 * PROVIDER ICONS: the reference demo uses real brand SVGs (Notion,
 * OpenAI, Google Drive, etc). This repo can't ship those same
 * trademarked marks without a license, so provider nodes render small
 * original geometric glyphs instead — see PROVIDER_LOGO_SOURCING.md (or
 * ask for it) for how to source real ones via @lobehub/icons if wanted.
 *
 * BEAM TIMING: unrelated to the reference demo (which just uses
 * duration=3 on every beam with no delay/repeatDelay, so its six beams
 * only coincidentally start in sync and drift apart on every loop after
 * the first). This version deliberately gives every beam the same
 * `duration` + `repeatDelay` so they stay phase-locked on *every* cycle,
 * with `delay` only staggering the very first pass so the outbound five
 * visibly cascade off the inbound one.
 */

const Node = forwardRef<
  HTMLDivElement,
  { className?: string; children?: ReactNode; label?: string }
>(({ className, children, label }, ref) => (
  <div className="flex flex-col items-center gap-2">
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full border-2 border-border bg-card p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      {children}
    </div>
    {label ? (
      <span className="font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
    ) : null}
  </div>
));
Node.displayName = "Node";

/** Original glyphs — geometric marks, not reproductions of any provider's logo. */
const ProviderGlyph = {
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

export function AnimatedBeamMultipleOutput({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Column 1 — user
  const userRef = useRef<HTMLDivElement>(null);

  // Column 2 — the platform hub
  const platformRef = useRef<HTMLDivElement>(null);

  // Column 3 — 5 providers
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
        {/* ── Column 1: user ─────────────────────────────────────── */}
        <div className="flex flex-col justify-center">
          <Node ref={userRef} label="You">
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
          </Node>
        </div>

        {/* ── Column 2: platform hub ─────────────────────────────── */}
        <div className="flex flex-col justify-center">
          <div className="flex flex-col items-center gap-3">
            <Node ref={platformRef} className="size-16 border-primary/40">
              {/* CSS brand mark — same cross motif as the site header's .brand-mark */}
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
            </Node>
            <span className="font-mono text-[10px] font-medium tracking-wider text-primary uppercase">
              OpenPortal
            </span>
          </div>
        </div>

        {/* ── Column 3: providers ────────────────────────────────── */}
        <div className="flex flex-col justify-center gap-2">
          <Node ref={openaiRef} label="OpenAI" className="text-foreground">
            {ProviderGlyph.openai}
          </Node>
          <Node ref={anthropicRef} label="Anthropic" className="text-foreground">
            {ProviderGlyph.anthropic}
          </Node>
          <Node ref={geminiRef} label="Gemini" className="text-foreground">
            {ProviderGlyph.gemini}
          </Node>
          <Node ref={deepseekRef} label="DeepSeek" className="text-foreground">
            {ProviderGlyph.deepseek}
          </Node>
          <Node ref={qwenRef} label="Qwen" className="text-foreground">
            {ProviderGlyph.qwen}
          </Node>
        </div>
      </div>

      {/* ── Beams ─────────────────────────────────────────────────────
         Every beam is measured relative to `containerRef`, so the mesh
         re-routes itself automatically on resize (same AnimatedBeam this
         repo already uses elsewhere — not the reference demo's plain
         version). Curvature fans outward symmetrically from the middle
         (Gemini) row.

         TIMING: every beam shares the same `duration` + `repeatDelay`,
         so they stay phase-locked on every cycle rather than drifting
         apart. `delay` only staggers each beam's very first start. */}
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
        curvature={-0.35}
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
        curvature={-0.15}
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
        curvature={0.15}
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
        curvature={0.35}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-2)"
      />
    </div>
  );
}
