/**
 * apps/web/features/chat/lib/param-slider.ts
 *
 * Phase 4c (rework). Pure value logic behind the parameter sliders and the
 * max-output stepper. Replaces lib/param-input.ts (text parsing), which
 * only existed because the old panel let people TYPE numbers.
 *
 * `null` still means "not set — provider default, omit from the request".
 * A slider can't be empty, so the UI shows a neutral position for `null`
 * (`defaultPosition`) and only produces a real number once the user moves
 * it; the per-row reset returns to `null`. That keeps the invariant the
 * wire format depends on: an untouched parameter is ABSENT, never a
 * default value we made up.
 */

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
}

/** Decimal places implied by a step: 0.05 → 2, 0.1 → 1, 1 → 0. */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Clamp to [min,max] and snap to the nearest step, without float drift
 *  (0.1 × 3 → 0.3, not 0.30000000000000004). Non-finite → `min`. */
export function snapToStep(raw: number, spec: SliderSpec): number {
  if (!Number.isFinite(raw)) return spec.min;
  const clamped = Math.min(spec.max, Math.max(spec.min, raw));
  const steps = Math.round((clamped - spec.min) / spec.step);
  const snapped = spec.min + steps * spec.step;
  const fixed = Number(snapped.toFixed(decimalsOf(spec.step)));
  return Math.min(spec.max, Math.max(spec.min, fixed));
}

/** 0–1 fraction of the track for a value (for the fill and thumb). */
export function sliderFraction(value: number, spec: SliderSpec): number {
  if (spec.max <= spec.min) return 0;
  return Math.min(1, Math.max(0, (value - spec.min) / (spec.max - spec.min)));
}

/** Label text for a value: fixed decimals matching the step. */
export function formatSliderValue(value: number, step: number): string {
  return value.toFixed(decimalsOf(step));
}

// ── max-output stepper ────────────────────────────────────────────────

/** Step size that gives a usable number of presses for a model ceiling. */
export function maxTokensStep(ceiling: number): number {
  if (ceiling >= 4096) return 256;
  if (ceiling >= 1024) return 128;
  return 32;
}

/** Where the stepper lands on its first press from "default". */
export function maxTokensStart(ceiling: number): number {
  return Math.min(1024, ceiling);
}

/**
 * Next max-output value for a −/+ press.
 *  - from `null` (default) either direction lands on `maxTokensStart`;
 *  - otherwise move by one step, clamped to [step, ceiling];
 *  - the ceiling is ALWAYS reachable even when it isn't a multiple of the
 *    step (e.g. 16,384 with step 256 is, but 200 with step 32 is not).
 */
export function stepMaxTokens(
  current: number | null,
  direction: 1 | -1,
  ceiling: number,
): number {
  const step = maxTokensStep(ceiling);
  if (current === null) return maxTokensStart(ceiling);
  const floor = Math.min(step, ceiling);
  const next = current + direction * step;
  if (direction === 1) return Math.min(ceiling, Math.max(floor, next));
  return Math.max(floor, Math.min(ceiling, next));
}

export function canStepMaxTokens(
  current: number | null,
  direction: 1 | -1,
  ceiling: number,
): boolean {
  if (current === null) return true;
  if (direction === 1) return current < ceiling;
  return current > Math.min(maxTokensStep(ceiling), ceiling);
}

/** A stored max_tokens may exceed a newly selected model's ceiling. */
export function clampMaxTokens(value: number | null, ceiling: number): number | null {
  if (value === null) return null;
  return Math.min(value, ceiling);
}
