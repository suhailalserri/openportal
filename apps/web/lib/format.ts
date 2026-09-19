import { MICRO_CREDIT } from "@ai-platform/config";

/**
 * Money & date formatting — the ONLY place credit math happens client-side
 * (Rule 1, FRONTEND_REBUILD_PLAN.md §3: "Money is never computed
 * client-side. The UI shows server results... one formatCredits() is the
 * only conversion.").
 *
 * D6 (locked 1.1): Arabic UI still uses Western digits (0-9), forced via
 * `numberingSystem: "latn"`. Without it, `toLocaleString("ar-SA")` renders
 * Eastern Arabic-Indic numerals (٠١٢٣...) by default — this file exists
 * specifically to fix that, so every call site gets it for free instead
 * of remembering the option each time.
 *
 * Consolidation note: this supersedes the formatCredits/formatDate that
 * previously lived in lib/utils.ts (same logic, missing the latn digit
 * fix). Every prior caller was inside the pages/components deleted in
 * this same 1.2 commit (app/[locale]/{admin,billing,settings}/**,
 * components/{chat,shared,settings,billing}/**), so there was nothing to
 * migrate — this is the sole implementation going forward.
 */

type Locale = "ar" | "en";

export function formatCredits(microCredits: number, locale: Locale = "ar"): string {
  const credits = microCredits / MICRO_CREDIT;
  return credits.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
    numberingSystem: "latn",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * YER (Yemeni rial) — the live payment currency per F8 (Jaib vouchers +
 * manual transfer; Moyasar/SAR is disabled). No minor unit in everyday
 * circulation, so this always renders whole rials.
 */
export function formatYer(amount: number, locale: Locale = "ar"): string {
  return amount.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
    numberingSystem: "latn",
    maximumFractionDigits: 0,
  });
}

export function formatDate(date: Date | string, locale: Locale = "ar"): string {
  return new Date(date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
    numberingSystem: "latn",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeDate(date: Date | string, locale: Locale = "ar"): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  const diffD = diffH / 24;

  if (diffH < 1) return locale === "ar" ? "الآن" : "just now";
  if (diffH < 24) return locale === "ar" ? `منذ ${Math.floor(diffH)} ساعة` : `${Math.floor(diffH)}h ago`;
  if (diffD < 2) return locale === "ar" ? "أمس" : "yesterday";
  if (diffD < 7) return locale === "ar" ? `منذ ${Math.floor(diffD)} أيام` : `${Math.floor(diffD)}d ago`;

  return formatDate(date, locale);
}
