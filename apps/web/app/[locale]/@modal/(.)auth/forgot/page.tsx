import { redirect } from "next/navigation";

import { decideAuthGuard } from "@/lib/guards";
import { getServerSession } from "@/lib/session";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Intercepts /{locale}/auth/forgot the same way the login/register
 * modals do — see the login modal's comment. In practice this is
 * reached by clicking "Forgot password?" from inside the already-open
 * login modal, so without this file that click would fall through to
 * the real page route and silently swap the overlay for a full-page
 * reload mid-flow.
 */
export default async function InterceptedForgotPasswordModal({ params }: Props) {
  const { locale } = await params;
  const session = await getServerSession();
  const decision = decideAuthGuard({ locale, session });
  if (decision.action === "redirect") redirect(decision.to);

  return <ForgotPasswordForm mode="modal" />;
}
