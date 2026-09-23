"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 4000;

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
 * A small "ⓘ" that explains a card/column title — built on the existing
 * `ui/tooltip.tsx` (Radix Tooltip), but CONTROLLED rather than purely
 * hover-driven. `dev/kitchen-sink`'s <Tooltip> usage only opens on
 * hover/focus, which does nothing on a touch screen — the exact request
 * here was "when clicked ... displayed and then disappeared like hover".
 *
 * `open` is local state:
 *  - Radix's own hover/focus events still flow through `onOpenChange`
 *    (so desktop hover keeps working exactly like the kitchen-sink one),
 *  - AND the trigger has its own `onClick` that opens it directly, which
 *    is what actually fires on a tap (mobile browsers don't synthesize
 *    hover from a tap the way desktop does).
 *  - Once open, it closes itself after a few seconds, on Escape, or on
 *    the next tap/click anywhere outside the trigger — Radix's built-in
 *    outside-dismiss is a Popover/DropdownMenu behaviour, not Tooltip's,
 *    so that part is done by hand here.
 */
export function InfoHint({ content, label, className }: InfoHintProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = React.useCallback(() => {
    setOpen(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const show = React.useCallback(() => {
    setOpen(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), AUTO_DISMISS_MS);
  }, []);

  // Unmount safety — don't fire setOpen after the component is gone.
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <Tooltip open={open} onOpenChange={(next) => (next ? show() : close())}>
      <TooltipTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          onClick={show}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <Info aria-hidden="true" className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60 text-start text-pretty" side="top">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
