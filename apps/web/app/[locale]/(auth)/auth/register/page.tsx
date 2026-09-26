import { RegisterForm } from "@/components/auth/register-form";

/** Direct-route fallback for /auth/register — see login/page.tsx's comment. */
export default function RegisterPage() {
  return <RegisterForm mode="page" />;
}
