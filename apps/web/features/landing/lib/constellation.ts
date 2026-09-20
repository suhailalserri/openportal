/**
 * apps/web/features/landing/lib/constellation.ts
 *
 * Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md). The physics for the hero's
 * "constellation" background — white/gold dots that drift randomly, are
 * joined by faint lines when close, gather around a touch/mouse point and
 * drift back when it is released.
 *
 * Deliberately pure (no DOM, no canvas, no React, no Math.random at
 * module level): the component (components/constellation-background.tsx)
 * owns the canvas, the rAF loop, colours and event wiring; everything
 * that can be wrong in a way a human would only notice by eye — dots
 * escaping the frame, not gathering, never returning — lives here so
 * constellation.test.ts can assert it without a browser.
 *
 * Units: positions in CSS px, velocities in px per 60 fps frame.
 * `dtMs` is scaled to "frames" (dt60) so the motion is the same speed on
 * 60/120/144 Hz screens, and clamped so a backgrounded tab resuming with
 * a multi-second gap cannot teleport the dots.
 */

export interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The slow random drift this dot returns to when nothing pulls it. */
  bvx: number;
  bvy: number;
  /** Draw radius in px. */
  r: number;
  /** true = theme primary (gold); false = theme foreground ("white"). */
  gold: boolean;
  /** Distance from the pointer at which this dot settles when gathered,
   *  so they form a loose halo rather than collapsing onto one pixel. */
  ring: number;
}

export interface Pointer {
  x: number;
  y: number;
  /** Current pull, eased toward `target` each frame (0 = none, 1 = full). */
  strength: number;
  /** 0 released · ~0.55 mouse hover · 1 pressed / touching. */
  target: number;
}

export interface StepOptions {
  /** Pointer influence radius in px. */
  pointerRadius: number;
}

export const POINTER_TARGET_HOVER = 0.55;
export const POINTER_TARGET_PRESSED = 1;

const MIN_DOTS = 24;
const MAX_DOTS = 90;
/** One dot per this many px² of hero area (before clamping). */
const AREA_PER_DOT = 14_000;
/** Fewer dots on narrow (phone) screens — the plan's slow-phone guard. */
const NARROW_WIDTH = 640;
const NARROW_MAX_DOTS = 55;

const MAX_DT60 = 3;
const MAX_SPEED = 4;
const GOLD_SHARE = 0.35;

/** Small, fast, seedable PRNG (mulberry32) — deterministic in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many dots to run for a hero of this size (hard-capped for perf). */
export function dotCountFor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 0;
  const cap = width < NARROW_WIDTH ? NARROW_MAX_DOTS : MAX_DOTS;
  const byArea = Math.floor((width * height) / AREA_PER_DOT);
  return Math.max(MIN_DOTS, Math.min(cap, byArea));
}

/** Max distance at which two dots are joined by a line. */
export function linkDistanceFor(width: number): number {
  return width < NARROW_WIDTH ? 90 : 120;
}

/** Pointer influence radius: smaller on phones (a fingertip is coarse). */
export function pointerRadiusFor(width: number): number {
  return width < NARROW_WIDTH ? 160 : 220;
}

/** Line opacity for two dots `dist` apart: 0 at linkDist, fading in. */
export function linkAlpha(dist: number, linkDist: number, max = 0.28): number {
  if (dist >= linkDist) return 0;
  const t = 1 - dist / linkDist;
  return t * t * max;
}

function makeDot(width: number, height: number, rng: () => number): Dot {
  const angle = rng() * Math.PI * 2;
  const speed = 0.12 + rng() * 0.26;
  const bvx = Math.cos(angle) * speed;
  const bvy = Math.sin(angle) * speed;
  return {
    x: rng() * width,
    y: rng() * height,
    vx: bvx,
    vy: bvy,
    bvx,
    bvy,
    r: 1 + rng() * 1.3,
    gold: rng() < GOLD_SHARE,
    ring: 18 + rng() * 46,
  };
}

export function createDots(
  count: number,
  width: number,
  height: number,
  rng: () => number,
): Dot[] {
  const dots: Dot[] = [];
  for (let i = 0; i < count; i++) dots.push(makeDot(width, height, rng));
  return dots;
}

/**
 * Grow/shrink an existing set to `count` and pull any dot that is now
 * outside the new frame back inside — used on resize so the field does
 * not visibly reset while the user rotates their phone.
 */
export function resizeDots(
  dots: Dot[],
  count: number,
  width: number,
  height: number,
  rng: () => number,
): Dot[] {
  const next = dots.slice(0, count);
  while (next.length < count) next.push(makeDot(width, height, rng));
  for (const d of next) {
    d.x = Math.min(Math.max(d.x, 0), width);
    d.y = Math.min(Math.max(d.y, 0), height);
  }
  return next;
}

/** Ease the pointer's strength toward its target. Mutates `p`. */
export function easePointer(p: Pointer, dtMs: number): void {
  const dt60 = clampDt(dtMs);
  // Fast rise (gather feels immediate), slower fall (drift back is soft).
  const rate = p.target > p.strength ? 0.16 : 0.05;
  p.strength += (p.target - p.strength) * (1 - Math.pow(1 - rate, dt60));
  if (p.target === 0 && p.strength < 0.002) p.strength = 0;
}

function clampDt(dtMs: number): number {
  if (!(dtMs > 0)) return 0;
  return Math.min(dtMs / (1000 / 60), MAX_DT60);
}

/**
 * Advance every dot by `dtMs`. Mutates `dots` in place (this runs every
 * frame; allocating a new array per frame would just feed the GC).
 * `pointer` may be null (nothing touching, or reduced motion).
 */
export function stepDots(
  dots: Dot[],
  dtMs: number,
  width: number,
  height: number,
  pointer: Pointer | null,
  opts: StepOptions,
): void {
  const dt60 = clampDt(dtMs);
  if (dt60 === 0) return;

  // Return-to-drift rate; scaled per dot by (1 - pull) below.
  const relax = 1 - Math.pow(1 - 0.02, dt60);
  const active = pointer !== null && pointer.strength > 0.001;

  for (const d of dots) {
    let pull = 0;

    if (active && pointer) {
      const dx = pointer.x - d.x;
      const dy = pointer.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < opts.pointerRadius) {
        pull = pointer.strength * (1 - dist / opts.pointerRadius);
        const inv = dist > 0.0001 ? 1 / dist : 0;
        // Spring toward this dot's ring around the pointer.
        const acc = (dist - d.ring) * 0.0016 * pull * dt60;
        d.vx += dx * inv * acc;
        d.vy += dy * inv * acc;
        // Damp while pulled so the halo settles instead of orbiting.
        const damp = 1 - Math.min(0.2, 0.12 * pull * dt60);
        d.vx *= damp;
        d.vy *= damp;
      }
    }

    // Ease back to the slow random drift (not while being pulled).
    const r = relax * (1 - pull);
    d.vx += (d.bvx - d.vx) * r;
    d.vy += (d.bvy - d.vy) * r;

    const speed = Math.hypot(d.vx, d.vy);
    if (speed > MAX_SPEED) {
      d.vx = (d.vx / speed) * MAX_SPEED;
      d.vy = (d.vy / speed) * MAX_SPEED;
    }

    d.x += d.vx * dt60;
    d.y += d.vy * dt60;

    // Bounce off the frame; flip the drift too so it heads back in.
    if (d.x < 0) {
      d.x = 0;
      d.vx = Math.abs(d.vx);
      d.bvx = Math.abs(d.bvx);
    } else if (d.x > width) {
      d.x = width;
      d.vx = -Math.abs(d.vx);
      d.bvx = -Math.abs(d.bvx);
    }
    if (d.y < 0) {
      d.y = 0;
      d.vy = Math.abs(d.vy);
      d.bvy = Math.abs(d.bvy);
    } else if (d.y > height) {
      d.y = height;
      d.vy = -Math.abs(d.vy);
      d.bvy = -Math.abs(d.bvy);
    }
  }
}
