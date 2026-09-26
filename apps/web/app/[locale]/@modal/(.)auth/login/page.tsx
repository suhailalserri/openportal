import { redirect } from "next/navigation";

import { decideAuthGuard } from "@/lib/guards";
import { getServerSession } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Intercepts client-side navigation to /{locale}/auth/login from any
 * sibling route under app/[locale]/ — in practice, the "Sign in" links
 * on the marketing landing page (features/landing). `(.)` matches the
 * interceptor's own segment level, which for this file is directly
 * under [locale] (route groups like (public)/(auth) aren't real path
 * segments, so the landing page and this file count as siblings there).
 *
 * Because this renders into the `@modal` slot instead of replacing the
 * page in the `children` slot, the landing page underneath stays
 * mounted the whole time — exactly the "opens over the current page
 * instead of navigating away" behavior. A hard refresh or direct visit
 * to /auth/login skips this file entirely and hits the real route at
 * (auth)/auth/login/page.tsx, which renders the same form as a full
 * page instead (see that file's comment).
 *
 * The (auth)/auth/layout.tsx guard that bounces an already-signed-in
 * visitor to /chat lives on a route group this file isn't under, so it
 * has to be repeated here explicitly — otherwise a signed-in visitor
 * who still has a stale "Sign in" link somewhere would get a login
 * modal instead of being sent to /chat.
 */
export default async function InterceptedLoginModal({ params }: Props) {
  const { locale } = await params;
  const session = await getServerSession();
  const decision = decideAuthGuard({ locale, session });
  if (decision.action === "redirect") redirect(decision.to);

  return <LoginForm mode="modal" />;
}
