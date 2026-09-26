import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { cn } from "@/lib/utils";
import { fontVariables } from "@/lib/fonts";
import { AppThemeProvider } from "@/providers/theme-provider";
import { AppDirectionProvider } from "@/providers/direction-provider";
import { TRPCQueryProvider } from "@/providers/trpc-query-provider";
import { AppToastProvider } from "@/providers/toast-provider";
import { ThemePresetSync } from "@/providers/theme-preset-sync";
import "@/styles/index.css";

const SUPPORTED_LOCALES = ["ar", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

interface Props {
  children: React.ReactNode;
  /**
   * The `@modal` parallel-route slot (app/[locale]/@modal/) — renders the
   * intercepted /auth/login and /auth/register modals on top of
   * `children` when reached via a client-side navigation from another
   * page in this locale, and null everywhere else (its default.tsx).
   * A parallel-route slot has to be declared and rendered here, on the
   * shared layout, to work at all; it doesn't do anything just by
   * existing on disk.
   */
  modal: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "ar" ? "البوابة المفتوحة | OpenPortal" : "OpenPortal | البوابة المفتوحة",
    description:
      locale === "ar"
        ? "ذكاء اصطناعي متقدم بسعر في متناول الجميع"
        : "Advanced AI models, accessibly priced",
  };
}

export default async function LocaleLayout({ children, modal, params }: Props) {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) notFound();

  // Must run before getMessages(): without it next-intl resolves the locale
  // from the request headers (set by middleware.ts), which makes every
  // statically rendered route under this layout throw DYNAMIC_SERVER_USAGE.
  // Harmless for dynamic routes.
  setRequestLocale(locale);

  const messages = await getMessages();
  const isRTL = locale === "ar";
  const direction = isRTL ? "rtl" : "ltr";

  return (
    // No hardcoded `className="dark"` — next-themes (AppThemeProvider)
    // owns the `light`/`dark` class on this element and reads the
    // visitor's saved choice (falling back to `dark`) before paint.
    // suppressHydrationWarning only covers that one attribute, which
    // next-themes intentionally sets client-side pre-paint.
    //
    // data-theme-preset="gateway" is the server-rendered DEFAULT only.
    // Phase 7.2's Settings → Preferences preset picker
    // (lib/theme-preset.ts) can override it per visitor; ThemePresetSync
    // (mounted in <body> below) applies the stored choice on mount,
    // same "read in an effect, not at render time" reasoning as
    // next-themes itself for the light/dark class — see suppressHydration-
    // Warning below, which already covers attribute changes on this
    // element.
    //
    // fontVariables (lib/fonts.ts) replaces the Google Fonts <link>
    // tags that used to live in <head>, including the broken
    // "IBM+Plex+Arabic" family name (F14) — next/font self-hosts the
    // files at build time, so there is no external request at all now.
    <html
      lang={locale}
      dir={direction}
      data-theme-preset="gateway"
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        className={cn(
          isRTL ? "font-arabic" : "font-inter",
          "bg-background text-foreground antialiased"
        )}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppThemeProvider>
            <AppDirectionProvider>
              <TRPCQueryProvider>
                <ThemePresetSync />
                {children}
                {modal}
                <AppToastProvider />
              </TRPCQueryProvider>
            </AppDirectionProvider>
          </AppThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
