"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Preset picker (also named in 2.2's "Build" line) is deliberately NOT
 * built here: 1.1 shipped exactly one preset ("gateway" — see
 * theme-presets.css's own header comment), so a picker would offer one
 * option. It becomes real in 7.2 once a 2nd/3rd preset exists; nothing
 * here blocks that — this component only owns light/dark/system.
 *
 * `mounted` guard: next-themes' resolved value is only known after
 * hydration (the actual theme is read from localStorage client-side).
 * Rendering the Sun/Moon icon based on `resolvedTheme` before mount
 * would either mismatch the server-rendered markup or require
 * `suppressHydrationWarning` on more than just the `<html>` class
 * (already used once in layout.tsx, deliberately scoped to just that).
 *
 * CIRCULAR REVEAL (added this session): when the user picks an option
 * that ACTUALLY changes the effective theme, the swap animates as a
 * circle expanding from the toggle button, via the View Transitions
 * API. The dropdown itself, the option set, the persistence and the
 * icons are unchanged — this is purely additive.
 *
 *   - The "effective theme" is `resolvedTheme`, which accounts for
 *     "system". Picking "Light" while already in light mode, or
 *     "System" when the OS is already in the current mode, does NOT
 *     animate — there is nothing to reveal. The preference is still
 *     saved in every case.
 *   - `startViewTransition` is Chrome 111+, Edge 111+, Safari 18+.
 *     Firefox has not shipped it; there the swap happens instantly,
 *     no error, no visible degradation. Same for
 *     `prefers-reduced-motion: reduce` — instant swap.
 *   - The circle origin is the toggle button's centre, published as
 *     `--theme-tx` / `--theme-ty` on `<html>` (see styles/index.css
 *     for the keyframes). Set synchronously before
 *     `startViewTransition`, so the animation always has the right
 *     origin.
 *   - One `requestAnimationFrame` defers the transition until AFTER
 *     Radix has closed the dropdown. Radix closes the menu in a
 *     microtask that runs after `onSelect` returns; if we called
 *     `startViewTransition` synchronously, its "before" snapshot
 *     would freeze the still-open menu, and the menu would then sit
 *     as a static image OUTSIDE the expanding circle for the whole
 *     450 ms. One rAF is enough — React flushes the menu-close
 *     commit before the browser paints, and rAF fires after that
 *     paint.
 */
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const OPTIONS = ["light", "dark", "system"] as const;
type ThemeOption = (typeof OPTIONS)[number];

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const Icon = mounted ? ICONS[(resolvedTheme as keyof typeof ICONS) ?? "dark"] : Monitor;

  const handleSelect = useCallback(
    (option: ThemeOption) => {
      // What this option would actually put on screen right now.
      // "system" resolves to the OS preference.
      const nextEffective = option === "system" ? systemTheme : option;
      const currentEffective = resolvedTheme;

      // Nothing to reveal when the effective theme is not changing
      // (picking "Light" while already light, or "System" when the OS
      // is already in the current mode). Preference is still saved.
      if (!nextEffective || nextEffective === currentEffective) {
        setTheme(option);
        return;
      }

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const doc = document as ViewTransitionDocument;
      const trigger = triggerRef.current;

      // Reduced motion or unsupported browser: plain swap.
      if (prefersReduced || !doc.startViewTransition || !trigger) {
        setTheme(option);
        return;
      }

      // See header note — defer one frame so the dropdown close commits
      // before we capture the "before" snapshot.
      requestAnimationFrame(() => {
        const rect = trigger.getBoundingClientRect();
        const tx = rect.left + rect.width / 2;
        const ty = rect.top + rect.height / 2;

        document.documentElement.style.setProperty("--theme-tx", `${tx}px`);
        document.documentElement.style.setProperty("--theme-ty", `${ty}px`);

        doc.startViewTransition!(() => {
          setTheme(option);
        });
      });
    },
    [resolvedTheme, systemTheme, setTheme],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} variant="ghost" size="icon" aria-label={t("toggle")}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => {
          const OptionIcon = ICONS[option];
          return (
            <DropdownMenuItem key={option} onSelect={() => handleSelect(option)}>
              <OptionIcon aria-hidden="true" />
              <span className="flex-1">{t(option)}</span>
              {mounted && theme === option ? <Check aria-hidden="true" className="size-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}