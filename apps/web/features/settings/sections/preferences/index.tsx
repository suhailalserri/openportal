"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AVAILABLE_PRESETS, readThemePreset, writeThemePreset, type ThemePreset,
} from "@/lib/theme-preset";
import { readLastModel, writeLastModel } from "@/features/chat/lib/chat-params-storage";
import { modelDisplayName } from "@/features/chat/lib/model-selection";

const OTHER_LOCALE: Record<string, string> = { ar: "en", en: "ar" };

/**
 * apps/web/features/settings/sections/preferences/index.tsx (Phase 7.2)
 *
 * Three independent controls, each own its own state — same "no shared
 * form" reasoning as SecuritySection (7.1):
 *
 *  - Locale: navigates like `components/layout/language-switcher.tsx`
 *    (this app has no next-intl routing helper — locale is a plain URL
 *    segment) AND persists server-side via `user.updateProfile({ locale })`
 *    so it isn't purely a per-browser cosmetic choice.
 *  - Theme + preset: theme wraps the same next-themes state
 *    `ThemeToggle` already owns (2.2) — changing it here changes the
 *    header icon too, and vice versa, since both read/write the one
 *    `next-themes` store. Preset is new: `lib/theme-preset.ts`, applied
 *    live via `writeThemePreset`. `AVAILABLE_PRESETS` currently has one
 *    entry ("gateway") — real per-CSS-source list, not a stub; see that
 *    file's header for why this isn't the "3 presets" D2 text.
 *  - Default model: reads/writes the EXISTING
 *    `readLastModel`/`writeLastModel` in `features/chat/lib/chat-
 *    params-storage.ts` (Phase 4c) rather than a new storage key — this
 *    is the same value the chat model picker already persists, so
 *    setting it here and picking a model in chat are the same action
 *    seen from two places.
 */
export function PreferencesSection() {
  const t = useTranslations("settings.preferences");
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => utils.user.getProfile.invalidate(),
  });

  function localeHref(target: string) {
    const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
    const query = searchParams.toString();
    return `/${target}${rest}${query ? `?${query}` : ""}`;
  }

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [preset, setPreset] = useState<ThemePreset>("gateway");
  useEffect(() => {
    setMounted(true);
    setPreset(readThemePreset());
  }, []);

  const { data: models, isLoading: modelsLoading } = trpc.models.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  useEffect(() => {
    setDefaultModel(readLastModel());
  }, []);

  const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Locale */}
        <div className="flex flex-col gap-2">
          <Label>{t("language")}</Label>
          <div className="flex gap-2">
            {(["ar", "en"] as const).map((code) =>
              locale === code ? (
                <Button key={code} type="button" variant="default" size="sm" disabled>
                  {code === "ar" ? t("arabic") : t("english")}
                </Button>
              ) : (
                <Button key={code} type="button" variant="outline" size="sm" asChild>
                  {/* Persists server-side (`user.updateProfile`) before the
                      URL-locale navigation actually happens — best-effort;
                      if the mutation fails the navigation still proceeds,
                      since the URL segment is the source of truth for
                      what the visitor SEES regardless of what's saved. */}
                  <Link
                    href={localeHref(code)}
                    hrefLang={code}
                    onClick={() => updateProfile.mutate({ locale: code })}
                  >
                    {code === "ar" ? t("arabic") : t("english")}
                  </Link>
                </Button>
              ),
            )}
          </div>
        </div>

        {/* Theme */}
        <div className="flex flex-col gap-2">
          <Label>{t("theme")}</Label>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((option) => {
              const Icon = THEME_ICONS[option];
              return (
                <Button
                  key={option}
                  type="button"
                  variant={mounted && theme === option ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setTheme(option)}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {t(`themeOptions.${option}`)}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Preset */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="pref-preset">{t("preset")}</Label>
          <Select
            value={preset}
            onValueChange={(v) => {
              const next = v as ThemePreset;
              setPreset(next);
              writeThemePreset(next);
            }}
          >
            <SelectTrigger id="pref-preset" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`presets.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Default model */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="pref-model">{t("defaultModel")}</Label>
          {modelsLoading ? (
            <Skeleton className="h-9 w-full sm:w-64" />
          ) : (
            <Select
              {...(defaultModel !== undefined ? { value: defaultModel } : {})}
              onValueChange={(id) => {
                setDefaultModel(id);
                writeLastModel(id);
              }}
            >
              <SelectTrigger id="pref-model" className="w-full sm:w-64">
                <SelectValue placeholder={t("defaultModelPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(models ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {modelDisplayName(m, locale as "ar" | "en")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">{t("defaultModelHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
