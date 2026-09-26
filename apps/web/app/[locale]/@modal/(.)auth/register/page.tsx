import { redirect } from "next/navigation";

import { decideAuthGuard } from "@/lib/guards";
import { getServerSession } from "@/lib/session";
import { RegisterForm } from "@/components/auth/register-form";

interface Props {
  params: Promise<{ locale: string }>;
}

/** Intercepts /{locale}/auth/register the same way — see the login modal's comment. */
export default async function InterceptedRegisterModal({ params }: Props) {
  const { locale } = await params;
  const session = await getServerSession();
  const decision = decideAuthGuard({ locale, session });
  if (decision.action === "redirect") redirect(decision.to);

  return <RegisterForm mode="modal" />;
}
