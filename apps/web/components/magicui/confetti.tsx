"use client";

import confetti from "canvas-confetti";

/**
 * apps/web/components/magicui/confetti.tsx (Phase 5.1)
 *
 * A "side cannons" burst — two low-angle streams firing inward from the
 * bottom corners, the same recipe canvas-confetti's own docs demonstrate
 * and that Magic UI's Confetti component (https://magicui.design/docs/components/confetti)
 * packages as a preset. That package isn't installed and its source
 * wasn't available to copy from in this sandbox (no network access), so
 * this is a small hand-written implementation directly against the
 * `canvas-confetti` library already being added in this phase — it is
 * NOT a copy of Magic UI's file (contrast with `border-beam.tsx`, which
 * says explicitly where it WAS copied from). If a later phase needs
 * Magic UI's actual `<Confetti>` React-ref API (imperative `confettiRef`,
 * custom canvas element, etc.), pull it from the registry then; this
 * covers only the one imperative call this phase needs.
 *
 * Fire-and-forget, no React component needed — call `fireRedeemSideCannons()`
 * from an event handler. Safe to call on the server (no-ops) and respects
 * `prefers-reduced-motion` (Rule: theme.css already disables animations
 * globally for that preference; this mirrors it for the canvas layer,
 * which CSS can't reach).
 */

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Reads a theme color CSS variable (e.g. "--primary") with a hex fallback for SSR/older browsers. */
function themeColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value.length > 0 ? value : fallback;
}

let firing = false;

/**
 * Fires a short (~700ms) two-cannon confetti burst from the bottom
 * corners of the viewport, using the app's own theme colors (gold
 * primary, teal success, amber warning) so it reads as "this app
 * celebrating," not a generic library demo.
 *
 * Guards against overlapping bursts (e.g. a fast double Enter) with a
 * module-level flag rather than relying solely on the caller's own
 * "already succeeded once" guard — belt and suspenders, since this
 * function may gain other call sites later.
 */
export function fireRedeemSideCannons(): void {
  if (typeof window === "undefined" || firing) return;
  if (prefersReducedMotion()) return; // no repeated bursts for users who opted out of motion

  const colors = [
    themeColor("--primary", "#B9791F"),
    themeColor("--success", "#147A69"),
    themeColor("--warning", "#9E5E1F"),
  ];

  firing = true;
  const end = Date.now() + 700;

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      startVelocity: 55,
      ticks: 200,
      origin: { x: 0, y: 0.9 },
      colors,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      startVelocity: 55,
      ticks: 200,
      origin: { x: 1, y: 0.9 },
      colors,
      disableForReducedMotion: true,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    } else {
      firing = false;
    }
  };

  requestAnimationFrame(frame);
}
