/**
 * Passkey feature gate + browser capability check, shared by the login
 * button, the post-signup offer dialog and the Settings section.
 *
 * PASSKEY_ENABLED comes from NEXT_PUBLIC_PASSKEY_ENABLED, which Next inlines
 * at BUILD time (like every NEXT_PUBLIC_* value) — set it, then redeploy.
 * Keeping it off until the domain is final matters because a passkey is
 * bound to the domain it was registered on.
 */
export const PASSKEY_ENABLED = process.env.NEXT_PUBLIC_PASSKEY_ENABLED === "true";

/** True in browsers that implement WebAuthn (all current mainstream ones). */
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}
