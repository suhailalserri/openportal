import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

const SUPPORTED_LOCALES = ["ar", "en"] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  if (!requested || !SUPPORTED_LOCALES.includes(requested as Locale)) notFound();

  const locale = requested as Locale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
