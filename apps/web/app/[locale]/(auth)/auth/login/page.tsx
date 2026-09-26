import { LoginForm } from "@/components/auth/login-form";

/**
 * Direct-route fallback for /auth/login: a deep link, a shared URL, or a
 * hard refresh while already on this route, none of which have a
 * marketing page mounted underneath to intercept from. The normal path —
 * clicking "Sign in" from the landing page — is caught by the @modal
 * slot's intercepting route instead (app/[locale]/@modal/(.)auth/login),
 * which renders this exact same <LoginForm> on top of the page the
 * visitor was already on. See AuthShell's comment for what `mode`
 * changes between the two.
 */
export default function LoginPage() {
  return <LoginForm mode="page" />;
}
