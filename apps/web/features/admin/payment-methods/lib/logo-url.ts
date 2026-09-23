/**
 * apps/web/features/admin/payment-methods/lib/logo-url.ts
 *
 * Client-side normalisation of the OPTIONAL logo URL field.
 *
 * `admin.createPaymentMethod` / `updatePaymentMethod` validate
 * `logoUrl: z.string().url().max(2048).optional()`. "Optional" there means
 * the key may be ABSENT — an empty string "" fails `.url()` (the raw zod
 * error the admin saw when saving a method with no logo). So blank must be
 * turned into "omit the key", and anything non-blank is checked here first
 * so the admin gets a readable inline message instead of a JSON dump.
 *
 * Only http(s) is accepted; the server's own check stays authoritative.
 */
export const LOGO_URL_MAX_LENGTH = 2048;

export type ParsedLogoUrl = { ok: true; value: string | undefined } | { ok: false };

export function parseLogoUrl(raw: string): ParsedLogoUrl {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  if (trimmed.length > LOGO_URL_MAX_LENGTH) return { ok: false };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
  return { ok: true, value: trimmed };
}
