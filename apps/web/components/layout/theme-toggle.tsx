"use client";

import { useEffect, useState } from "react";
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
 */
const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const Icon = mounted ? ICONS[(resolvedTheme as keyof typeof ICONS) ?? "dark"] : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("toggle")}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["light", "dark", "system"] as const).map((option) => {
          const OptionIcon = ICONS[option];
          return (
            <DropdownMenuItem key={option} onSelect={() => setTheme(option)}>
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
