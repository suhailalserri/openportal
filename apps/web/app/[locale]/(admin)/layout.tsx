import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { decideAdminGuard, getSessionRole } from "@/lib/guards";
import { getRequestPath, getServerSession } from "@/lib/session";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Role guard for /admin/** (admin | superadmin). Keeps the check the
 * legacy admin layout had, plus the `?next=` round-trip.
 *
 * This only stops the admin SHELL from loading for the wrong people (and
 * the burst of 403s that would follow). The data is protected by the
 * `admin.*` procedures, which enforce the role on the server regardless
 * of anything decided here.
 */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  const [session, requestPath] = await Promise.all([getServerSession(), getRequestPath()]);

  const decision = decideAdminGuard({ locale, session, requestPath });
  if (decision.action === "redirect") redirect(decision.to);

  return <AppShell role={getSessionRole(session)}>{children}</AppShell>;
}
