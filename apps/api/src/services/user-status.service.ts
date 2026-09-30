import { isIP } from "node:net";
import { db, users, auditLogs } from "@ai-platform/db";
import { eq } from "drizzle-orm";
import { revokeUserSessions } from "./session-revocation.service";

/**
 * The single implementation of "suspend / reactivate a user" (plan P1.1,
 * G2b). Its only caller is tRPC `admin.updateUserStatus` (what the admin UI
 * uses). The legacy Next.js `PATCH /api/admin/users/[id]` route that used to
 * share these rules was deleted in P3.5 (it bypassed the admin 2FA gate);
 * migration 0018's trigger stays as the DB-level backstop for any other writer.
 *
 * Returns a result instead of throwing so each caller maps errors to its own
 * transport (TRPCError vs HTTP status). Every early return happens BEFORE any
 * write, so a rejected call changes nothing.
 */
export type UserStatusChangeErrorCode =
  | "ACTOR_NOT_FOUND"
  | "NOT_AN_ADMIN"
  | "CANNOT_MODIFY_SELF"
  | "USER_NOT_FOUND"
  | "INSUFFICIENT_ROLE_FOR_TARGET";

export type UserStatusChangeResult =
  | { ok: true; sessionsRevoked: number }
  | { ok: false; code: UserStatusChangeErrorCode };

export interface UserStatusChangeInput {
  actorId:  string;
  targetId: string;
  status:   "active" | "suspended";
  reason?:  string | undefined;
  /** Raw client IP as the caller knows it; anything that is not a single valid IP is stored as NULL. */
  ip?:      string | null | undefined;
}

/** `audit_logs.ip` is a Postgres `inet`: "unknown" or "a, b" would make the insert throw. */
export function toInetOrNull(raw: string | null | undefined): string | null {
  const first = raw?.split(",")[0]?.trim();
  return first && isIP(first) ? first : null;
}

export async function applyUserStatusChange(
  input: UserStatusChangeInput,
): Promise<UserStatusChangeResult> {
  return await db.transaction(async (tx): Promise<UserStatusChangeResult> => {
    // Trust the DB, not the caller: role is re-read here.
    const [actor] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.actorId))
      .limit(1);
    if (!actor) return { ok: false, code: "ACTOR_NOT_FOUND" };
    if (actor.role !== "admin" && actor.role !== "superadmin") {
      return { ok: false, code: "NOT_AN_ADMIN" };
    }

    // No self-service lockout/unlock.
    if (input.targetId === input.actorId) return { ok: false, code: "CANNOT_MODIFY_SELF" };

    const [target] = await tx
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, input.targetId))
      .limit(1);
    if (!target) return { ok: false, code: "USER_NOT_FOUND" };

    // Only a superadmin may change an admin or another superadmin.
    if (
      (target.role === "admin" || target.role === "superadmin") &&
      actor.role !== "superadmin"
    ) {
      return { ok: false, code: "INSUFFICIENT_ROLE_FOR_TARGET" };
    }

    // Suspension kills live sessions immediately. The API key row is left
    // intact on purpose: the account guard blocks it while suspended and
    // reactivation restores it.
    //
    // ORDER MATTERS: migration 0018's `users_revoke_sessions_on_lockout`
    // trigger deletes the user's sessions during the status UPDATE below. If
    // we revoked AFTER the update, our DELETE would find nothing and the
    // audit row would record sessionsRevoked: 0. Revoking first (same
    // transaction, so still all-or-nothing) yields the true count; the
    // trigger stays as the backstop for writers outside this code.
    const sessionsRevoked =
      input.status === "suspended" ? await revokeUserSessions(input.targetId, tx) : 0;

    await tx.update(users)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(users.id, input.targetId));

    await tx.insert(auditLogs).values({
      adminId:    input.actorId,
      action:     `user.${input.status}`,
      targetType: "user",
      targetId:   input.targetId,
      before:     { status: target.status },
      after:      { status: input.status, reason: input.reason, sessionsRevoked },
      ip:         toInetOrNull(input.ip),
    });

    return { ok: true, sessionsRevoked };
  });
}
