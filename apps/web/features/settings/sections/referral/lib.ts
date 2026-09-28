/**
 * apps/web/features/settings/sections/referral/lib.ts (Phase 7.2)
 *
 * Pure so it's unit-testable without a DOM (same pattern as
 * features/chat/lib/model-selection.ts's header comment).
 */
/**
 * With a `locale`, the link points straight at the register page
 * (`/{locale}/auth/register?ref=CODE`) — the only page that reads `ref`
 * (register-form.tsx). That makes attribution independent of the
 * bare-`/` locale redirect in middleware.ts and of any landing-page
 * hop, both of which used to drop the code. Without a locale it keeps
 * the original `/?ref=CODE` shape.
 */
export function buildReferralLink(appUrl: string, code: string, locale?: "ar" | "en"): string {
  const base = appUrl.replace(/\/+$/, "");
  const query = `?ref=${encodeURIComponent(code)}`;
  return locale ? `${base}/${locale}/auth/register${query}` : `${base}/${query}`;
}
