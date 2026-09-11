/**
 * Server-side verification for Cloudflare Turnstile tokens.
 *
 * Used to gate abuse-prone endpoints (registration, redeem-code) behind a
 * human check without the puzzle-solving friction of classic CAPTCHAs.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

/**
 * Verifies a Turnstile response token against Cloudflare's siteverify API.
 *
 * If TURNSTILE_SECRET_KEY is not set, this no-ops and returns success —
 * matching the optional() schema in apps/api/src/config.ts. This means
 * local dev works without a Cloudflare account, but ALSO means Turnstile
 * provides zero protection until the secret is actually configured. Set
 * TURNSTILE_SECRET_KEY before relying on this in production.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) return { success: true };

  if (!token) return { success: false, error: "MISSING_TOKEN" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(VERIFY_URL, { method: "POST", body });

    if (!res.ok) {
      return { success: false, error: `HTTP_${res.status}` };
    }

    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };

    if (!data.success) {
      return { success: false, error: data["error-codes"]?.join(",") ?? "VERIFICATION_FAILED" };
    }

    return { success: true };
  } catch (err) {
    // Network failure talking to Cloudflare — fail closed. This guards a
    // real abuse vector, so an unreachable verify endpoint should block
    // the action rather than silently let it through.
    console.error("Turnstile verification request failed:", err);
    return { success: false, error: "VERIFY_REQUEST_FAILED" };
  }
}

/** Best-effort client IP extraction, consistent with apps/api's rate limiter. */
export function getClientIp(headers: Headers): string | undefined {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined
  );
}
