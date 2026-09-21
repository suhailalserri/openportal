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
import "@/styles/index.css";

const SUPPORTED_LOCALES = ["ar", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

interface Props {
  children: React.ReactNode;
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

export default async function LocaleLayout({ children, params }: Props) {
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
    // data-theme-preset="gateway" is static: 1.2 ships exactly one
    // preset (theme-presets.css), so there's no runtime choice to make
    // yet and no hydration-mismatch risk. A preset switcher is Phase
    // 7.2's job — this attribute is what it will start toggling.
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
                {children}
                <AppToastProvider />
              </TRPCQueryProvider>
            </AppDirectionProvider>
          </AppThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
