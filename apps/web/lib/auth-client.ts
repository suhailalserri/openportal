import { createAuthClient }  from "better-auth/react";
import { twoFactorClient }   from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  // Must mirror the server's `plugins: [twoFactor()]` in lib/auth.ts, or
  // authClient.twoFactor.* below won't exist. No onTwoFactorRedirect here —
  // the login page checks `result.data?.twoFactorRedirect` on the sign-in
  // call itself and swaps to an inline code-entry step, rather than
  // navigating to a separate route.
  plugins: [twoFactorClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  sendVerificationEmail,
  // Settings → Security: change password, active-sessions list/revoke.
  changePassword,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  revokeSessions,
  // Settings → Security: 2FA enable/verify/disable/backup codes.
  twoFactor,
} = authClient;
