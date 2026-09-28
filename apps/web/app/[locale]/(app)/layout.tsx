import { redirect } from "next/navigation";

import { PasskeyOfferDialog } from "@/components/auth/passkey-offer-dialog";
import { WelcomeBonusDialog } from "@/features/welcome-bonus/components/welcome-bonus-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { decideAppGuard, getSessionRole } from "@/lib/guards";
import { getRequestPath, getServerSession } from "@/lib/session";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Server guard for every signed-in page (Rule 4). Signed-out visitors
 * are redirected to login with `?next=` set to where they were headed
 * (sanitised inside buildLoginRedirect).
 *
 * Known limit: layouts do not re-run on client-side navigation. A session
 * that expires while the tab is open is caught by the next API 401, not
 * here — Phase 2.2's error handling covers that.
 */
export default async function AppLayout({ children, params }: Props) {
  const { locale } = await params;
  const [session, requestPath] = await Promise.all([getServerSession(), getRequestPath()]);

  const decision = decideAppGuard({ locale, session, requestPath });
  if (decision.action === "redirect") redirect(decision.to);

  return (
    <>
      <AppShell role={getSessionRole(session)}>{children}</AppShell>
      {/* One-time "set up a passkey?" card for brand-new accounts. Client
          component; renders nothing unless passkeys are enabled. */}
      <PasskeyOfferDialog />
      {/* One-time welcome-gift claim card; waits for the passkey card to finish, never stacks on it. */}
      <WelcomeBonusDialog />
    </>
  );
}
