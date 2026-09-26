import { VerifyForm } from "@/components/auth/verify-form";

/**
 * Direct-route fallback for /auth/verify — a deep link, a shared URL, or
 * a hard refresh. The normal path is the redirect RegisterForm issues
 * right after a successful sign-up (`router.push(/auth/verify?email=)`),
 * which the @modal slot's intercepting route now catches instead
 * (app/[locale]/@modal/(.)auth/verify), keeping the visitor inside the
 * same overlay they were just registering in rather than bouncing them
 * to a full-page reload. See AuthShell's comment for what `mode` changes
 * between the two.
 */
export default function VerifyPage() {
  return <VerifyForm mode="page" />;
}
