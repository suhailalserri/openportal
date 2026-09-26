"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

const VISIBLE_MS = 4000;
const ANIMATION_MS = 150;
const VIEWPORT_MARGIN = 8;

type Phase = "closed" | "entering" | "open" | "exiting";
type Placement = "top" | "bottom";

interface Coords {
  top: number;
  left: number;
  placement: Placement;
}

interface InfoHintProps {
  /** The explanation shown in the bubble — what the metric means and its unit. */
  content: React.ReactNode;
  /** Accessible label for the trigger (the icon itself is decorative). */
  label: string;
  className?: string;
}

/**
 * apps/web/components/shared/info-hint.tsx
 *
 * A small "ⓘ" that explains a card/column title.
 *
 * v2 (redesign): previously built on `ui/tooltip.tsx` (Radix Tooltip),
 * controlled via a manual `open` state layered on top. The bug report —
 * "when I click it, it closes immediately" — traces to Radix Tooltip
 * itself: it's a hover/focus primitive, and on a tap it fires its own
 * pointer-leave/blur close logic microtasks after the manual `show()`
 * call, racing it shut. Layering click support on a hover primitive
 * doesn't fix that; it just hides the race most of the time.
 *
 * This version drops Radix Tooltip and owns the whole open/visible/close
 * lifecycle as plain state — nothing else can close it out from under a
 * click:
 *  - Tap/click the icon → opens immediately, no hover race.
 *  - Auto-dismisses after `VISIBLE_MS`.
 *  - Also dismissible early: tap outside, Escape, or tap the icon again.
 *  - `phase` (`entering` → `open` → `exiting` → `closed`) drives a CSS
 *    fade/scale transition instead of Radix's `data-state` animate-in/out.
 *
 * Rendered via `createPortal` into `document.body` (not inline, absolutely
 * positioned, the way v1 was) because callers now include cards with
 * `overflow-hidden` (`ShineCard`, for the shine-sweep mask) — an inline
 * absolute bubble would get silently clipped by that. Position is
 * measured from the trigger's `getBoundingClientRect()` on open and kept
 * in sync on scroll/resize while visible; flips from below to above the
 * trigger if there isn't room underneath (e.g. TopModelCard sits at the
 * very top of the page).
 *
 * Visual redesign: themed as a small popover card (`bg-popover` /
 * `text-popover-foreground` / `border-border` — theme tokens, follows
 * whatever theme preset + light/dark mode is active) with a soft shadow
 * and a pointing arrow, rather than the previous plain dark tooltip pill.
 */
export function InfoHint({ content, label, className }: InfoHintProps) {
  const [phase, setPhase] = React.useState<Phase>("closed");
  const [coords, setCoords] = React.useState<Coords | null>(null);
  const [mounted, setMounted] = React.useState(false);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const bubbleRef = React.useRef<HTMLDivElement>(null);
  const dismissTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const animTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rafRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => setMounted(true), []);

  const clearTimers = React.useCallback(() => {
    if (dismissTimeout.current) clearTimeout(dismissTimeout.current);
    if (animTimeout.current) clearTimeout(animTimeout.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const measure = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;
    const roomBelow = window.innerHeight - rect.bottom;
    const placement: Placement = roomBelow < bubbleHeight + VIEWPORT_MARGIN + 8 ? "top" : "bottom";
    setCoords({
      top: placement === "bottom" ? rect.bottom + 8 : rect.top - 8,
      left: Math.min(
        Math.max(rect.left + rect.width / 2, VIEWPORT_MARGIN),
        window.innerWidth - VIEWPORT_MARGIN,
      ),
      placement,
    });
  }, []);

  const close = React.useCallback(() => {
    clearTimers();
    setPhase((current) => (current === "closed" ? current : "exiting"));
    animTimeout.current = setTimeout(() => setPhase("closed"), ANIMATION_MS);
  }, [clearTimers]);

  const open = React.useCallback(() => {
    clearTimers();
    measure();
    setPhase("entering");
    // One frame with the "entering" (hidden) styles applied first, so the
    // transition to "open" (visible) actually animates instead of
    // snapping in.
    rafRef.current = requestAnimationFrame(() => {
      measure();
      setPhase("open");
    });
    dismissTimeout.current = setTimeout(close, VISIBLE_MS);
  }, [clearTimers, close, measure]);

  const toggle = React.useCallback(() => {
    if (phase === "closed" || phase === "exiting") open();
    else close();
  }, [phase, open, close]);

  React.useEffect(() => clearTimers, [clearTimers]);

  const isVisible = phase !== "closed";

  React.useEffect(() => {
    if (!isVisible) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onReposition = () => measure();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [isVisible, close, measure]);

  const placement = coords?.placement ?? "bottom";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={isVisible}
        onClick={toggle}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors",
          "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>

      {mounted && isVisible
        ? createPortal(
            <div
              ref={bubbleRef}
              role="tooltip"
              style={{
                position: "fixed",
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                transform: `translate(-50%, ${placement === "bottom" ? "0" : "-100%"})`,
              }}
              className={cn(
                "z-50 w-max max-w-60",
                placement === "bottom" ? "origin-top" : "origin-bottom",
                "rounded-xl border border-border bg-popover px-3 py-2 text-xs text-pretty text-start text-popover-foreground",
                "shadow-lg shadow-black/10 backdrop-blur-sm",
                "transition-all duration-150 ease-out",
                phase === "open" ? "scale-100 opacity-100" : "scale-95 opacity-0",
              )}
            >
              {content}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border-border bg-popover",
                  placement === "bottom"
                    ? "-top-1 border-t border-l"
                    : "-bottom-1 border-b border-r",
                )}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
