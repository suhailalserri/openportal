"use client";

import * as React from "react";

import {
  createDots,
  dotCountFor,
  easePointer,
  linkAlpha,
  linkDistanceFor,
  mulberry32,
  pointerRadiusFor,
  POINTER_TARGET_HOVER,
  POINTER_TARGET_PRESSED,
  resizeDots,
  stepDots,
  type Dot,
  type Pointer,
} from "@/features/landing/lib/constellation";

/**
 * apps/web/features/landing/components/constellation-background.tsx
 *
 * Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md). The DOM/canvas half of the
 * hero's dot field — "white and gold dots drift randomly... on
 * mouse/touch, dots gather around the point and drift back on release."
 * All physics (drift, gathering, bounce, link-line fade) is in
 * lib/constellation.ts and unit-tested there without a browser; this
 * component only owns the canvas, the rAF loop, colour resolution, and
 * event wiring, per that file's own module doc.
 *
 * PERFORMANCE GUARDS (the plan's "slow phones" concern):
 *  - Paused via `document.visibilityState` (tab hidden) AND an
 *    IntersectionObserver (hero scrolled out of view) — either alone
 *    would miss a case a real user hits (background tab vs. scrolled
 *    past the hero on a long page).
 *  - devicePixelRatio is capped at 2 (a 3x phone screen does not get a
 *    3x canvas — 4x-9x fewer pixels than an uncapped canvas would draw).
 *  - dotCountFor() already scales down on narrow (phone) screens
 *    (lib/constellation.ts NARROW_MAX_DOTS) — nothing here needs to
 *    duplicate that.
 *
 * REDUCED MOTION: draws exactly one static frame (dots placed, zero
 * velocity, no pointer interaction, no rAF loop started at all) rather
 * than a slowed-down animation — matches Reveal and ShimmerButton's own
 * "drop the motion" (not "slow the motion") convention this phase.
 *
 * THEME: colours are read from the resolved CSS custom properties
 * (`--primary` for "gold" dots, `--foreground` for "white" dots) via
 * getComputedStyle at draw time, not hard-coded hex — so light/dark and
 * any future theme-presets.css swap are picked up automatically,
 * including on a live theme toggle (re-read every frame is cheap; a
 * dedicated MutationObserver on the `dark` class would be a premature
 * optimization for a value this cheap to re-read).
 */

export function ConstellationBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rng = mulberry32(0x5eed);

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let lastT = 0;
    let running = false;
    let inView = true;

    const pointer: Pointer = { x: 0, y: 0, strength: 0, target: 0 };
    let pointerActive = false;

    function resolveColor(varName: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#EDEAE2";
    }

    function resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const count = dotCountFor(width, height);
      dots = dots.length ? resizeDots(dots, count, width, height, rng) : createDots(count, width, height, rng);

      if (prefersReducedMotion) drawStatic();
    }

    function drawStatic() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const gold = resolveColor("--primary");
      const white = resolveColor("--foreground");
      for (const d of dots) {
        ctx.beginPath();
        ctx.fillStyle = d.gold ? gold : white;
        ctx.globalAlpha = d.gold ? 0.85 : 0.55;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const linkDist = linkDistanceFor(width);
      const border = resolveColor("--foreground");

      // Link lines first (under the dots).
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.hypot(dx, dy);
          const alpha = linkAlpha(dist, linkDist);
          if (alpha <= 0) continue;
          ctx.beginPath();
          ctx.strokeStyle = border;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1;
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }

      const gold = resolveColor("--primary");
      const white = resolveColor("--foreground");
      for (const d of dots) {
        ctx.beginPath();
        ctx.fillStyle = d.gold ? gold : white;
        ctx.globalAlpha = d.gold ? 0.9 : 0.6;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function frame(t: number) {
      if (!running) return;
      const dtMs = lastT ? t - lastT : 16;
      lastT = t;

      easePointer(pointer, dtMs);
      stepDots(dots, dtMs, width, height, pointerActive || pointer.strength > 0 ? pointer : null, {
        pointerRadius: pointerRadiusFor(width),
      });
      draw();

      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || prefersReducedMotion) return;
      running = true;
      lastT = 0;
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointerActive = true;
      pointer.target = e.pointerType === "touch" ? POINTER_TARGET_PRESSED : POINTER_TARGET_HOVER;
    }

    function onPointerDown(e: PointerEvent) {
      onPointerMove(e);
      pointer.target = POINTER_TARGET_PRESSED;
    }

    function onPointerUp() {
      pointer.target = 0;
    }

    function onPointerLeave() {
      pointer.target = 0;
      pointerActive = false;
    }

    resize();

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView && document.visibilityState === "visible") start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(container);

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && inView) start();
      else stop();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div ref={containerRef} aria-hidden className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}
