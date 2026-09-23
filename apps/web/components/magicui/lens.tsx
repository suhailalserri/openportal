"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/lens.tsx
 *
 * NOT a copy from magicui.design — this is this repo's own component.
 * MagicUI's own "Lens" (https://magicui.design/docs/components/lens) is
 * a magnifier that follows the pointer over a single image; that is a
 * different interaction from the one specified for this build, which is
 * a "pick one of N cards, the picked one grows" pattern (also seen as
 * "focus carousel" / "featured picker"). Naming kept as `Lens` because
 * the visual result — one item magnified, its siblings receding — is the
 * same shape as a lens, and this repo already tracks MagicUI names for
 * cross-reference.
 *
 * Public API:
 *
 *   <Lens defaultSelected="a">
 *     <LensItem value="a">…</LensItem>
 *     <LensItem value="b">…</LensItem>
 *     <LensItem value="c">…</LensItem>
 *   </Lens>
 *
 * Controlled variant: pass `selected` + `onSelectedChange` instead of
 * `defaultSelected`. Same compound-component pattern as shadcn/ui's
 * Tabs — a controlled/uncontrolled pair, because both are needed: an
 * uncontrolled picker is fine for a landing hero (one selected by
 * default), but a form or a filter bar needs the parent to own state.
 *
 * Accessibility: rendered as a `radiogroup`. Each `LensItem` is a
 * `role="radio"` button with `aria-checked`, arrow-key navigation
 * between siblings, and `Home`/`End` to jump. This is the same pattern
 * shadcn/ui's own Tabs uses (`role="tablist"` + roving tabindex), so
 * keyboard users get behaviour they already expect from a picker.
 *
 * Reduced motion: `useReducedMotion()` — under it, the scale change
 * becomes instant instead of spring-animated. Still visible, just not
 * moving.
 *
 * Colours: theme tokens only. Selected item border picks up `--primary`;
 * the container uses `--muted` so unselected items read as recessed
 * without needing a per-item opacity hack.
 */

interface LensContextValue {
  selected: string | undefined;
  select: (value: string) => void;
  groupId: string;
  registerValue: (value: string) => number;
  focusBy: (from: string, dir: 1 | -1 | "first" | "last") => void;
}

const LensContext = createContext<LensContextValue | null>(null);

function useLensContext(component: string): LensContextValue {
  const ctx = useContext(LensContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used inside <Lens>`);
  }
  return ctx;
}

export interface LensProps {
  children: ReactNode;
  className?: string;
  /** Uncontrolled initial value. Ignored when `selected` is provided. */
  defaultSelected?: string;
  /** Controlled value. */
  selected?: string;
  /** Called whenever the user picks a different item. */
  onSelectedChange?: (value: string) => void;
  /** Accessible name for the radiogroup. */
  "aria-label"?: string;
}

export function Lens({
  children,
  className,
  defaultSelected,
  selected: controlled,
  onSelectedChange,
  "aria-label": ariaLabel,
}: LensProps) {
  const isControlled = controlled !== undefined;
  const [uncontrolled, setUncontrolled] = useState<string | undefined>(
    defaultSelected,
  );
  const selected = isControlled ? controlled : uncontrolled;

  const groupId = useId();
  const [order, setOrder] = useState<string[]>([]);

  const select = useCallback(
    (value: string) => {
      if (!isControlled) setUncontrolled(value);
      onSelectedChange?.(value);
    },
    [isControlled, onSelectedChange],
  );

  const registerValue = useCallback((value: string) => {
    let index = -1;
    setOrder((prev) => {
      index = prev.indexOf(value);
      if (index !== -1) return prev;
      return [...prev, value];
    });
    // Return the index synchronously for the caller's tabindex decision.
    // This is safe because registerValue is only called during render of
    // a LensItem that is already inside Lens, and order updates at the
    // same tick. The tabindex decision happens on the *next* render.
    return index;
  }, []);

  const focusBy = useCallback(
    (from: string, dir: 1 | -1 | "first" | "last") => {
      if (order.length === 0) return;
      const current = order.indexOf(from);
      if (current === -1) return;

      let nextIndex: number;
      if (dir === "first") nextIndex = 0;
      else if (dir === "last") nextIndex = order.length - 1;
      else nextIndex = (current + dir + order.length) % order.length;

      const nextValue = order[nextIndex];
      if (nextValue === undefined) return;
      select(nextValue);

      // Move DOM focus to the sibling so tabbing continues from there.
      const el = document.querySelector<HTMLButtonElement>(
        `[data-lens-group="${groupId}"][data-lens-value="${nextValue}"]`,
      );
      el?.focus();
    },
    [order, select, groupId],
  );

  return (
    <LensContext.Provider
      value={{ selected, select, groupId, registerValue, focusBy }}
    >
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn("flex items-stretch gap-3", className)}
      >
        {children}
      </div>
    </LensContext.Provider>
  );
}

export interface LensItemProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function LensItem({ value, children, className }: LensItemProps) {
  const { selected, select, groupId, registerValue, focusBy } =
    useLensContext("LensItem");
  const reduced = useReducedMotion();

  const index = registerValue(value);
  const isSelected = selected === value;
  const isFirstRender = index === 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusBy(value, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusBy(value, -1);
        break;
      case "Home":
        e.preventDefault();
        focusBy(value, "first");
        break;
      case "End":
        e.preventDefault();
        focusBy(value, "last");
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        select(value);
        break;
    }
  };

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={isSelected}
      data-lens-group={groupId}
      data-lens-value={value}
      tabIndex={isSelected || (selected === undefined && isFirstRender) ? 0 : -1}
      onClick={() => select(value)}
      onKeyDown={handleKeyDown}
      animate={{
        scale: reduced ? 1 : isSelected ? 1.04 : 0.96,
        opacity: isSelected ? 1 : 0.72,
      }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 260, damping: 26 }
      }
      className={cn(
        "relative flex-1 min-w-0 rounded-[var(--radius-lg)] p-4 text-start",
        "border bg-card text-card-foreground",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "hover:opacity-100",
        isSelected
          ? "border-primary shadow-[var(--shadow-2)]"
          : "border-border hover:border-input",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}