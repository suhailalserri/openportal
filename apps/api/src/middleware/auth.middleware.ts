import type { FastifyRequest, FastifyReply } from "fastify";
import { db, users, sessions } from "@ai-platform/db";
import { eq, and, gt }         from "drizzle-orm";
import { createHash }          from "node:crypto";
import { touchActiveUser }     from "../metrics";
import { assertUsableAccount, ACCOUNT_REST_ERROR } from "../utils/account-guard";

/**
 * P1.1 / L14: the single place this file decides whether a resolved user may
 * proceed. Returns true (and has already sent the 403) when the account is
 * locked. Used by ALL three auth paths below — the session-cookie path used
 * to skip it entirely (gap G2).
 */
function rejectIfUnusable(
  user:  typeof users.$inferSelect,
  reply: FastifyReply,
): boolean {
  const guard = assertUsableAccount(user);
  if (guard.ok) return false;
  reply.status(403).send({ error: ACCOUNT_REST_ERROR[guard.reason] });
  return true;
}

declare module "fastify" {
  interface FastifyRequest {
    user?:             typeof users.$inferSelect;
    isApiKeyAuth?:     boolean;
    isInternalAuth?:   boolean;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  // ── Path 1: Internal service-to-service token (web → api) ──────────
  // The Next.js web app forwards verified user sessions using a shared
  // secret + X-User-ID header. Validate the secret first, then load user.
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (
    internalToken &&
    authHeader === `Bearer ${internalToken}` &&
    request.headers["x-user-id"]
  ) {
    const userId = request.headers["x-user-id"] as string;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (user) {
      if (rejectIfUnusable(user, reply)) return;
      request.user           = user;
      request.isInternalAuth = true;
      void touchActiveUser(user.id);
      return;
    }
  }

  // ── Path 2: Session cookie ──────────────────────────────────────────
  const sessionToken = request.cookies?.["better-auth.session_token"];
  if (sessionToken) {
    // See trpc.ts createContext — sessions must be looked up by `token`,
    // the value better-auth actually places in the cookie, not `id`.
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.token, sessionToken),
        gt(sessions.expiresAt, new Date())
      ),
    });
    if (session) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.userId),
      });
      if (user) {
        if (rejectIfUnusable(user, reply)) return;
        request.user = user;
        void touchActiveUser(user.id);
        return;
      }
    }
  }

  // ── Path 3: Bearer API key (developer access) ───────────────────────
  if (authHeader?.startsWith("Bearer sk-aip-")) {
    const rawKey  = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const user = await db.query.users.findFirst({
      where: eq(users.apiKeyHash, keyHash),
    });

    if (user) {
      if (rejectIfUnusable(user, reply)) return;
      request.user         = user;
      request.isApiKeyAuth = true;
      void touchActiveUser(user.id);
      return;
    }
  }

  reply.status(401).send({ error: "Authentication required" });
}

export async function requireAdmin(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  if (!request.user) { reply.status(401).send({ error: "Unauthorized" }); return; }
  if (!["admin", "superadmin"].includes(request.user.role)) {
    reply.status(403).send({ error: "Forbidden" }); return;
  }
}
