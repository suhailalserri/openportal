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
 * Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md). PAGE-WIDE dot field (moved
 * out of the hero's own <section> — a follow-up round of this phase, per
 * explicit feedback that confining it to the hero's box read as
 * incomplete against a full page of scroll): "white and gold dots drift
 * randomly... on mouse/touch, dots gather around the point and drift
 * back on release." All physics (drift, gathering, bounce, link-line
 * fade) is in lib/constellation.ts and unit-tested there without a
 * browser; this component only owns the canvas, the rAF loop, colour
 * resolution, and event wiring, per that file's own module doc.
 *
 * MOUNTED ONCE, AT THE PAGE ROOT (index.tsx), `position: fixed`, behind
 * everything (`-z-10`), not inside LandingHero. A single canvas sized to
 * the viewport (not the full scrollable document) is intentional: fixed
 * positioning means it never needs to be document-height, which keeps
 * the pixel count — and therefore the per-frame link-distance check's
 * O(n²) cost — bounded to one screenful regardless of how long the page
 * is, rather than growing with page length.
 *
 * PERFORMANCE GUARDS (the plan's "slow phones" concern):
 *  - Paused via `document.visibilityState` only now — there is no
 *    "scrolled past the hero" case anymore once this covers the whole
 *    viewport, so the previous IntersectionObserver-on-the-hero pause
 *    is gone; a full-page fixed background is either on-screen (tab
 *    visible) or not (tab hidden), nothing in between.
 *  - devicePixelRatio is capped at 2 (a 3x phone screen does not get a
 *    3x canvas — 4x-9x fewer pixels than an uncapped canvas would draw).
 *  - dotCountFor() already scales down on narrow (phone) screens
 *    (lib/constellation.ts NARROW_MAX_DOTS) — nothing here needs to
 *    duplicate that. Because this now sizes to the viewport instead of
 *    one hero section, absolute dot count for the same screen width is
 *    similar to before (viewport height, not hero height, but
 *    dotCountFor is area-based off width primarily — see that file).
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

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    const pointer: Pointer = { x: 0, y: 0, strength: 0, target: 0 };
    let pointerActive = false;

    function resolveColor(varName: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#EDEAE2";
    }

    function resize() {
      if (!canvas) return;
      // Viewport-sized, not document-sized: the canvas is `position:
      // fixed`, so it only ever needs to cover what's currently visible.
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
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
        const a = dots[i];
        if (!a) continue;
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          if (!b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          const alpha = linkAlpha(dist, linkDist);
          if (alpha <= 0) continue;
          ctx.beginPath();
          ctx.strokeStyle = border;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
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

    // WHY window listeners, not canvas listeners: the hero's text block
    // (`relative z-10`) covers the whole section, so the canvas underneath
    // never receives a pointer event. Listening on `window` and testing
    // against the canvas rect works no matter what sits on top, and does
    // not block clicks on the buttons above it.
    function localPoint(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      return { x, y, inside };
    }

    function onPointerMove(e: PointerEvent) {
      const p = localPoint(e);
      if (!p.inside) {
        if (pointerActive) onPointerLeave();
        return;
      }
      pointer.x = p.x;
      pointer.y = p.y;
      pointerActive = true;
      pointer.target = e.pointerType === "touch" ? POINTER_TARGET_PRESSED : POINTER_TARGET_HOVER;
    }

    function onPointerDown(e: PointerEvent) {
      const p = localPoint(e);
      if (!p.inside) return;
      pointer.x = p.x;
      pointer.y = p.y;
      pointerActive = true;
      pointer.target = POINTER_TARGET_PRESSED;
    }

    function onPointerUp(e: PointerEvent) {
      // Touch has no hover: release fully. Mouse falls back to hover.
      if (e.pointerType === "touch") {
        pointer.target = 0;
        pointerActive = false;
      } else if (pointerActive) {
        pointer.target = POINTER_TARGET_HOVER;
      }
    }

    function onPointerLeave() {
      pointer.target = 0;
      pointerActive = false;
    }

    resize();
    if (!prefersReducedMotion) start();

    // No IntersectionObserver anymore: a `position: fixed`, full-viewport
    // canvas has no "scrolled past it" state to detect — it is either on
    // a visible tab or it isn't, which visibilitychange alone covers.
    window.addEventListener("resize", resize, { passive: true });

    function onVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Ambient "gate" glow — sits behind the dot canvas, matching the
          reference design's `body::before` radial wash (a soft amber
          ellipse near the top of the viewport). Purely decorative. */}
      <div
        className="absolute left-1/2 top-[-20vh] -z-10 h-[100vh] w-[140vw] -translate-x-1/2 opacity-55"
        style={{
          background:
            "radial-gradient(ellipse 40% 55% at 50% 20%, color-mix(in oklab, var(--primary) 35%, transparent) 0%, transparent 60%)",
        }}
      />
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
