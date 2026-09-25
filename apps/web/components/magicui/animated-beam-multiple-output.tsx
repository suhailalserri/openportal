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
 * The center node renders the REAL brand mark from apps/web/public/logo.svg
 * (`/logo.svg` at runtime). A plain `<img>`, not next/image — SVG would
 * need `dangerouslyAllowSVG` in next.config, and this file is a static,
 * size-known asset where the optimizer buys nothing.
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

export function AnimatedBeamMultipleOutput({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Left column
  const userRef = useRef<HTMLDivElement>(null);

  // Center column — the platform mark
  const platformRef = useRef<HTMLDivElement>(null);

  // Right column — 5 providers
  const gptRef = useRef<HTMLDivElement>(null);
  const claudeRef = useRef<HTMLDivElement>(null);
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

        {/* ── Column 2: platform (the real logo) ─────────────────── */}
        <div className="flex flex-col justify-center">
          <div className="flex flex-col items-center gap-3">
            <div ref={platformRef} className="z-10 grid place-items-center">
              <div
                className="relative size-24"
                style={{
                  filter:
                    "drop-shadow(0 0 32px color-mix(in oklab, var(--color-primary) 55%, transparent))",
                }}
              >
                <img
                  src="/logo.svg"
                  alt=""
                  width={96}
                  height={96}
                  className="size-full object-contain"
                />
              </div>
            </div>
            <span className="font-mono text-[10px] font-medium tracking-wider text-primary uppercase">
              OpenPortal
            </span>
          </div>
        </div>

        {/* ── Column 3: providers ────────────────────────────────── */}
        <div className="flex flex-col justify-center gap-3">
          <Node ref={gptRef} label="GPT">
            <span className="font-mono text-xs font-bold">GPT</span>
          </Node>
          <Node ref={claudeRef} label="Claude">
            <span className="font-mono text-xs font-bold">CLD</span>
          </Node>
          <Node ref={geminiRef} label="Gemini">
            <span className="font-mono text-xs font-bold">GEM</span>
          </Node>
          <Node ref={deepseekRef} label="DeepSeek">
            <span className="font-mono text-xs font-bold">DSK</span>
          </Node>
          <Node ref={qwenRef} label="Qwen">
            <span className="font-mono text-xs font-bold">QWN</span>
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
        toRef={gptRef}
        duration={3.4}
        delay={0.4}
        curvature={-0.1}
        gradientStartColor="var(--color-primary)"
        gradientStopColor="var(--color-chart-2)"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={platformRef}
        toRef={claudeRef}
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