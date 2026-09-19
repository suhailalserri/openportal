import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Money and date formatting live in lib/format.ts — the single
// conversion point Rule 1 requires (formatCredits, formatYer, formatDate,
// formatRelativeDate). Import from there, not here.

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
