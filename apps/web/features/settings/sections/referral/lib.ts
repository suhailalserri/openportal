/**
 * apps/web/features/settings/sections/referral/lib.ts (Phase 7.2)
 *
 * Pure so it's unit-testable without a DOM (same pattern as
 * features/chat/lib/model-selection.ts's header comment).
 */
export function buildReferralLink(appUrl: string, code: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/?ref=${encodeURIComponent(code)}`;
}
