"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/features/chat/components/composer/composer-panel.tsx
 *
 * Phase 4c (rework). The inline panel that opens UPWARD from the composer
 * card (model list, parameters). It is NOT a portal/popover: it lives in
 * the composer's own positioned box, so it is exactly the composer's width
 * at any screen size, follows the page in RTL/LTR for free, and cannot be
 * clipped by a stacking context elsewhere.
 *
 * Why not Radix Popover: it isn't a dependency and adding one needs a
 * lockfile regeneration this workflow can't do offline.
 *
 * Height: capped at min(60dvh, 440px) and scrolls inside, so on a phone
 * with the keyboard open the panel never grows past the visible viewport.
 */
export interface ComposerPanelProps {
  id: string;
  /** Accessible name of the region. */
  label: string;
  className?: string;
  children: React.ReactNode;
}

export function ComposerPanel({ id, label, className, children }: ComposerPanelProps) {
  return (
    <div
      id={id}
      role="region"
      aria-label={label}
      className={cn(
        "absolute inset-x-0 bottom-full z-30 mb-2 max-h-[min(60dvh,440px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-3 shadow-2",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-150",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Calls `onDismiss` when, while `active`, the user presses Escape or puts a
 * pointer down outside `ref`'s element. `ref` should wrap BOTH the panel
 * and its trigger buttons — otherwise tapping a trigger to close its own
 * panel would first fire "outside" and then toggle it straight back open.
 */
export function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: (reason: "outside" | "escape") => void,
) {
  const callback = React.useRef(onDismiss);
  React.useEffect(() => {
    callback.current = onDismiss;
  }, [onDismiss]);

  React.useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) callback.current("outside");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") callback.current("escape");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, ref]);
}
