import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { MICRO_CREDIT } from "@ai-platform/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(microCredits: number, locale = "ar"): string {
  const credits = microCredits / MICRO_CREDIT;
  return credits.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDate(date: Date | string, locale = "ar"): string {
  return new Date(date).toLocaleDateString(
    locale === "ar" ? "ar-SA" : "en-US",
    { year: "numeric", month: "short", day: "numeric" }
  );
}

export function formatRelativeDate(date: Date | string, locale = "ar"): string {
  const now   = new Date();
  const d     = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffH  = diffMs / (1000 * 60 * 60);
  const diffD  = diffH  / 24;

  if (diffH < 1)   return locale === "ar" ? "الآن" : "just now";
  if (diffH < 24)  return locale === "ar" ? `${Math.floor(diffH)} ساعة` : `${Math.floor(diffH)}h ago`;
  if (diffD < 2)   return locale === "ar" ? "أمس" : "yesterday";
  if (diffD < 7)   return locale === "ar" ? `${Math.floor(diffD)} أيام` : `${Math.floor(diffD)}d ago`;

  return formatDate(date, locale);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
