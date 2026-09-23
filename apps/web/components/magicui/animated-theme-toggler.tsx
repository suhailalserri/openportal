"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/animated-theme-toggler.tsx
 *
 * Magic UI "Animated Theme Toggler" —
 * https://magicui.design/docs/components/animated-theme-toggler (MIT,
 * © Magic UI). Adapted from the registry version for this repo:
 *
 *  1. Uses next-themes (`useTheme`) rather than the registry's bare
 *     `document.documentElement.classList.toggle("dark")` — this repo's
 *     theme state lives in next-themes (see providers/, Phase 1.2), so
 *     the toggler has to go through the same source of truth or the
 *     `.dark` class and the persisted preference will drift apart.
 *  2. Icon defaults swapped from MagicUI's bundled inline SVGs to
 *     `lucide-react` (`Sun` / `Moon`), which is already a dependency and
 *     the icon set used everywhere else in this repo.
 *  3. Theme tokens only: the button chrome uses `bg-card` /
 *     `border-border` / `text-foreground`; the reveal colour comes from
 *     `--background` (read live at click time) so the circular wipe
 *     always matches whichever theme is being revealed into.
 *  4. `mounted` guard mirrors magic-card.tsx — SSR renders a neutral
 *     placeholder so the icon doesn't flicker between server and client.
 *     Do NOT read `resolvedTheme` outside the `mounted &&` branch.
 *  5. Reduced motion: falls back to an instant theme swap. The view
 *     transition API is a nice-to-have, not a correctness requirement.
 *
 * The circular reveal uses `document.startViewTransition` + a CSS
 * clip-path keyframe. Browser support: Chrome 111+, Edge 111+, Safari
 * 18+. Everywhere else the swap just happens without animation — no
 * error, no fallback UI needed.
 *
 * Requires in styles/index.css (append anywhere):
 *
 *   @keyframes theme-toggle-reveal {
 *     from { clip-path: circle(0% at var(--tx) var(--ty)); }
 *     to   { clip-path: circle(150% at var(--tx) var(--ty)); }
 *   }
 *   ::view-transition-new(root) { animation: theme-toggle-reveal 450ms ease-in; }
 *   ::view-transition-old(root) { animation: none; }
 */

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

interface AnimatedThemeTogglerProps {
  className?: string;
  /** Accessible label. Defaults to a generic toggle phrasing. */
  label?: string;
}

export function AnimatedThemeToggler({
  className,
  label = "Toggle theme",
}: AnimatedThemeTogglerProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const toggle = useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark";

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const doc = document as ViewTransitionDocument;
    const button = buttonRef.current;

    if (prefersReduced || !doc.startViewTransition || !button) {
      setTheme(next);
      return;
    }

    const rect = button.getBoundingClientRect();
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;

    document.documentElement.style.setProperty("--tx", `${tx}px`);
    document.documentElement.style.setProperty("--ty", `${ty}px`);

    doc.startViewTransition(() => {
      setTheme(next);
    });
  }, [resolvedTheme, setTheme]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-label={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full",
        "border border-border bg-card text-foreground",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {mounted && resolvedTheme === "dark" ? (
        <Moon className="size-4" aria-hidden="true" />
      ) : (
        <Sun className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}