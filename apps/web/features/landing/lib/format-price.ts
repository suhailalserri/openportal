/**
 * apps/web/features/landing/lib/format-price.ts
 *
 * Display formatting for the landing page's fractional YER amounts and
 * token counts. lib/format.ts's formatYer deliberately renders whole
 * rials only (payment amounts have no minor unit) — but a per-1,000-token
 * price is often below 10 YER, where rounding to a whole number would
 * print "0" or "1" for very different prices. This is FORMATTING only:
 * every value passed in was already computed by pricing.ts on the server
 * (Rule 1). Western digits everywhere (D6), same as lib/format.ts.
 */

export type LocaleTag = "ar" | "en";

function intlTag(locale: LocaleTag): string {
  return locale === "ar" ? "ar-SA" : "en-US";
}

/**
 * Fractional YER: 0 -> "0", <10 -> up to 2 decimals, <100 -> 1 decimal,
 * otherwise whole. A non-zero value that would round to 0 shows as "<0.01".
 */
export function formatYerPrecise(amount: number, locale: LocaleTag): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (amount < 0.01) return "<0.01";
  const maximumFractionDigits = amount < 10 ? 2 : amount < 100 ? 1 : 0;
  return amount.toLocaleString(intlTag(locale), {
    numberingSystem: "latn",
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

/** A plain integer with locale grouping and Western digits. */
export function formatInteger(value: number, locale: LocaleTag): string {
  return Math.round(value).toLocaleString(intlTag(locale), {
    numberingSystem: "latn",
    maximumFractionDigits: 0,
  });
}

export type CompactTokens = { unit: "K" | "M" | "raw"; value: number };

/**
 * Splits a token count into a compact unit for the "Context" column:
 * 8,192 -> 8K, 128,000 -> 128K, 1,048,576 -> 1M. The caller turns the
 * unit into words through next-intl (ar says "ألف"/"مليون", not K/M).
 */
export function compactTokens(n: number): CompactTokens {
  if (n >= 1_000_000) {
    return { unit: "M", value: Math.round((n / 1_000_000) * 10) / 10 };
  }
  if (n >= 1_000) return { unit: "K", value: Math.round(n / 1_000) };
  return { unit: "raw", value: n };
}

/** Milliseconds -> seconds with one decimal ("1.2"), or null if unknown. */
export function responseSeconds(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 100) / 10;
}
