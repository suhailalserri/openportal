import { redirect } from "next/navigation";

import { decideAuthGuard } from "@/lib/guards";
import { getServerSession } from "@/lib/session";
import { VerifyForm } from "@/components/auth/verify-form";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Intercepts /{locale}/auth/verify the same way the login/register
 * modals do — see the login modal's comment. In practice this is
 * reached by RegisterForm's `router.push(/auth/verify?email=...)` right
 * after a successful sign-up from inside the register modal, so without
 * this file that redirect would fall through to the real page route and
 * silently swap the overlay for a full-page reload right after signup.
 */
export default async function InterceptedVerifyModal({ params }: Props) {
  const { locale } = await params;
  const session = await getServerSession();
  const decision = decideAuthGuard({ locale, session });
  if (decision.action === "redirect") redirect(decision.to);

  return <VerifyForm mode="modal" />;
}
