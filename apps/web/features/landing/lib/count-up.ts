/**
 * apps/web/features/landing/lib/count-up.ts
 *
 * Phase 3.3. The pure part of the animated stats ("Total users",
 * "Models available"): given how far through the animation we are,
 * what number do we show? No DOM, no React, no timers — so
 * count-up.test.ts can assert the curve, the endpoints and the
 * degenerate inputs without a browser.
 *
 * The component (components/animated-number.tsx) owns requestAnimationFrame
 * and IntersectionObserver; it feeds elapsed time in here.
 */

/** Ease-out cubic: fast start, gentle landing. 0 -> 0, 1 -> 1, monotonic. */
export function easeOutCubic(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

/**
 * The whole number to display `elapsedMs` into a `durationMs` animation
 * heading to `target`. Always an integer, never overshoots `target`, and
 * lands EXACTLY on `target` at (or after) the end, so the final frame can
 * never show a value that differs from the real figure.
 *
 * Degenerate input fails toward the truth: a non-finite / non-positive
 * duration, or a non-finite target, returns the target (or 0) directly
 * instead of animating garbage.
 */
export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(target)) return 0;
  const end = Math.round(target);
  if (end <= 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return end;
  if (!Number.isFinite(elapsedMs) || elapsedMs >= durationMs) return end;
  if (elapsedMs <= 0) return 0;
  const value = Math.round(end * easeOutCubic(elapsedMs / durationMs));
  return Math.min(end, Math.max(0, value));
}
