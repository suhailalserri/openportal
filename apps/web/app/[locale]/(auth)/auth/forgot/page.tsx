import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

/**
 * Direct-route fallback for /auth/forgot: a deep link, a shared URL, or
 * a hard refresh while already on this route, none of which have a page
 * mounted underneath to intercept from. The normal path — clicking
 * "Forgot password?" inside the login modal — is caught by the @modal
 * slot's intercepting route instead (app/[locale]/@modal/(.)auth/forgot),
 * which renders this exact same <ForgotPasswordForm> on top of the login
 * modal's own overlay. See AuthShell's comment for what `mode` changes
 * between the two.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm mode="page" />;
}
