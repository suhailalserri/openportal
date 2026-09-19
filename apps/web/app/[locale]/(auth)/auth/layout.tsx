/**
 * Frame for the auth pages. INERT until Phase 3.1 — no page exists under
 * (auth)/auth/ yet, so nothing renders through this layout. Until then
 * the redirect target `/{locale}/auth/login` 404s (expected; see the 2.1
 * notes in docs/frontend/BRANCH_AND_CI_NOTES.md).
 *
 * 3.1 adds login / register / verify / forgot / reset as siblings of
 * this file. Deliberately no session check here: whether a signed-in
 * visitor is bounced away from /auth/* (and which auth routes are exempt,
 * e.g. verify) is a 3.1 decision.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-background p-4">{children}</main>;
}
