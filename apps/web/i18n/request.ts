import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

const SUPPORTED_LOCALES = ["ar", "en"] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

export default getRequestConfig(async ({ locale }) => {
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) notFound();

  return {
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
