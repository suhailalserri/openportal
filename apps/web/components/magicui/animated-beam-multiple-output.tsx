"use client";

import { forwardRef, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "./animated-beam";

/**
 * apps/web/components/magicui/animated-beam-multiple-output.tsx
 *
 * The scene the landing page's gateway diagram uses:
 *
 *     [ user ] ─── beam ──▶ [ OpenPortal ] ── 5 beams ──▶ [ provider × 5 ]
 *
 * Layout is a 3-column grid; beams are drawn by AnimatedBeam between the
 * relevant element refs. Everything is measured at runtime, so it works
 * at any container width without hard-coded coordinates.
 *
 * CENTER NODE: `apps/web/public/logo.svg` does not exist in this repo,
 * so rather than point an <img> at a 404 this renders the same
 * CSS-only brand mark the header uses (Newlending.html's `.brand-mark`:
 * a plus/cross built from two gradient bars). If/when a real logo.svg
 * is added to /public, swap this node's contents for an <img src="/logo.svg">
 * the same way landing-header-bar.tsx does.
 *
 * PROVIDER NODES: each renders a small original geometric glyph (not a
 * reproduction of any provider's trademarked logo) so the row reads as
 * "five distinct providers" at a glance instead of plain text badges.
 * Swap these for real brand SVGs later if you add licensed assets under
 * /public/providers/*.svg — the Node/ref wiring below doesn't change.
 */

const Node = forwardRef<
  HTMLDivElement,
  { className?: string; children?: ReactNode; label?: string }
>(({ className, children, label }, ref) => (
  <div className="flex flex-col items-center gap-2">
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full border-2 border-border bg-card p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.6)]",
        "transition-[border-color,box-shadow] duration-300",
        "hover:border-primary/60 hover:shadow-[0_8px_32px_-12px_var(--color-primary)]",
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

  // Left column
  const userRef = useRef<HTMLDivElement>(null);

  // Center column — the platform mark
  const platformRef = useRef<HTMLDivElement>(null);

  // Right column — 5 providers
  const openaiRef = useRef<HTMLDivElement>(null);
  const anthropicRef = useRef<HTMLDivElement>(null);
  const geminiRef = useRef<HTMLDivElement>(null);
  const deepseekRef = useRef<HTMLDivElement>(null);
  const qwenRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[480px] w-full items-center justify-center overflow-hidden p-10",
        className,
      )}
    >
      <div className="flex size-full max-w-3xl flex-row items-stretch justify-between gap-10">
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

        {/* ── Column 2: platform mark ─────────────────────────────── */}
        <div className="flex flex-col justify-center">
          <div className="flex flex-col items-center gap-3">
            <div ref={platformRef} className="z-10 grid place-items-center">
              <div
                className="relative flex size-24 items-center justify-center rounded-full border-2 border-primary/40 bg-card"
                style={{
                  filter:
                    "drop-shadow(0 0 32px color-mix(in oklab, var(--color-primary) 55%, transparent))",
                }}
              >
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
              </div>
            </div>
            <span className="font-mono text-[10px] font-medium tracking-wider text-primary uppercase">
              OpenPortal
            </span>
          </div>
        </div>

        {/* ── Column 3: providers ────────────────────────────────── */}
        <div className="flex flex-col justify-center gap-3">
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
         re-routes itself automatically on resize. Delays stagger so the
         five outbound beams don't pulse in lockstep. */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={userRef}
        toRef={platformRef}
        duration={3}
        curvature={0.15}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-1)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={openaiRef}
        duration={3.4}
        delay={0.4}
        curvature={-0.1}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-2)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={anthropicRef}
        duration={3.2}
        delay={0.7}
        curvature={-0.05}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-3)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={geminiRef}
        duration={3.6}
        delay={1.0}
        curvature={0}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-4)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={deepseekRef}
        duration={3.3}
        delay={1.3}
        curvature={0.05}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-5)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={qwenRef}
        duration={3.5}
        delay={1.6}
        curvature={0.1}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-2)"
      />
    </div>
  );
}
