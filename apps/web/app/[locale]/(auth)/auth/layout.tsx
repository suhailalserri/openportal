import { redirect } from "next/navigation";

import { decideAuthGuard } from "@/lib/guards";
import { getServerSession } from "@/lib/session";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Frame for the auth pages (login/register/verify/forgot/reset), Phase
 * 3.1. Server guard (Rule 4): a signed-in visitor is bounced to
 * /{locale}/chat rather than being shown a login form that would just
 * error on submit (already-authenticated) — see decideAuthGuard's own
 * comment in lib/guards.ts for why `next` isn't preserved on this
 * specific bounce, unlike the (app)/(admin) guards.
 */
export default async function AuthLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await getServerSession();

  const decision = decideAuthGuard({ locale, session });
  if (decision.action === "redirect") redirect(decision.to);

  return <main className="grid min-h-dvh place-items-center bg-background p-4">{children}</main>;
}
