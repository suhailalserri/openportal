import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import "../globals.css";

const SUPPORTED_LOCALES = ["ar", "en"] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

interface Props {
  children:  React.ReactNode;
  params:    Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:       locale === "ar" ? "البوابة المفتوحة | OpenPortal" : "OpenPortal | البوابة المفتوحة",
    description: locale === "ar"
      ? "ذكاء اصطناعي متقدم بسعر في متناول الجميع"
      : "Advanced AI models, accessibly priced",
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) notFound();

  const messages  = await getMessages();
  const isRTL     = locale === "ar";
  const direction = isRTL ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={direction} className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={isRTL ? "font-arabic" : "font-inter"}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
          </Providers>
          <Toaster
            position={isRTL ? "bottom-left" : "bottom-right"}
            dir={direction}
            toastOptions={{
              style: {
                background: "#1D1815",
                border:     "1px solid #4A423B",
                color:      "#F7F4EF",
              },
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
