"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light",  icon: Sun,     labelKey: "theme.light"  },
  { value: "dark",   icon: Moon,    labelKey: "theme.dark"   },
  { value: "system", icon: Monitor, labelKey: "theme.system" },
] as const;

// `resolvedTheme` (what's actually painted) drives the trigger icon;
// `theme` (the stored preference, which may be "system") drives the
// checkmark in the menu — they diverge whenever the preference is
// "system", and conflating them would show the wrong icon or check.
export function ThemeToggle({ dir = "ltr" }: { dir?: "ltr" | "rtl" }) {
  const t = useTranslations();
  const { theme, resolvedTheme, setTheme } = useTheme();
  // next-themes can't know the persisted/system theme until after
  // mount (it reads localStorage + matchMedia client-side), so the
  // server-rendered pass and the first client pass must agree on a
  // neutral icon — otherwise React logs a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ActiveIcon = mounted
    ? (OPTIONS.find(o => o.value === resolvedTheme)?.icon ?? Sun)
    : Monitor;

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          aria-label={t("theme.toggle")}
        >
          <ActiveIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className={mounted && theme === value ? "bg-blue-600/20" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {t(labelKey as Parameters<typeof t>[0])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
