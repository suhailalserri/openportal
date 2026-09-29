/**
 * Account-usability guard (plan P1.1, decision L14: one shared guard, never
 * copy-pasted).
 *
 * Pure on purpose: no DB, no Fastify, no tRPC imports. It is used by the
 * Fastify `authMiddleware` (all three auth paths) AND by the tRPC
 * `protectedProcedure` / `adminProcedure`, and the latter are also served by
 * the Next.js entry point (apps/web/server/context.ts feeds the same
 * appRouter). Keeping this file dependency-free means it can never drag
 * Fastify or the DB client into the web build.
 *
 * Semantics deliberately match what `authMiddleware` already did on its
 * internal-token and API-key paths:
 *   - any `status` other than "active" is refused as "suspended"
 *     (this includes "pending_verification": better-auth does not issue a
 *     session before email verification, and `ensureUserSetup` in
 *     apps/web/lib/auth.ts activates verified users at session creation);
 *   - `isFraudFlagged` is refused as "fraud_flagged".
 * Suspension is checked first, so a user who is both is reported as suspended.
 */

export type AccountGuardReason = "suspended" | "fraud_flagged";

export type AccountGuardResult =
  | { ok: true }
  | { ok: false; reason: AccountGuardReason };

export interface GuardableUser {
  status:         string;
  isFraudFlagged: boolean;
}

export function assertUsableAccount(user: GuardableUser): AccountGuardResult {
  if (user.status !== "active") return { ok: false, reason: "suspended" };
  if (user.isFraudFlagged)      return { ok: false, reason: "fraud_flagged" };
  return { ok: true };
}

/**
 * Stable machine-readable codes carried in the message of the tRPC
 * `FORBIDDEN` error, so the frontend can map them (see
 * apps/web/lib/trpc-error.ts). Never localise or reword these.
 */
export const ACCOUNT_ERROR_CODE = {
  suspended:     "ACCOUNT_SUSPENDED",
  fraud_flagged: "ACCOUNT_UNDER_REVIEW",
} as const satisfies Record<AccountGuardReason, string>;

/**
 * Bodies for the REST surface (`/chat` and friends). These are the strings
 * `authMiddleware` has always returned; they are an external contract and
 * must not change in P1.1.
 */
export const ACCOUNT_REST_ERROR = {
  suspended:     "Account suspended",
  fraud_flagged: "Account under review",
} as const satisfies Record<AccountGuardReason, string>;
