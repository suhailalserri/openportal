import type { FastifyRequest, FastifyReply } from "fastify";
import { db, users, sessions } from "@ai-platform/db";
import { eq, and, gt }         from "drizzle-orm";
import { createHash }          from "node:crypto";

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
      if (user.status !== "active") {
        reply.status(403).send({ error: "Account suspended" }); return;
      }
      if (user.isFraudFlagged) {
        reply.status(403).send({ error: "Account under review" }); return;
      }
      request.user           = user;
      request.isInternalAuth = true;
      return;
    }
  }

  // ── Path 2: Session cookie ──────────────────────────────────────────
  const sessionToken = request.cookies?.["better-auth.session_token"];
  if (sessionToken) {
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, sessionToken),
        gt(sessions.expiresAt, new Date())
      ),
    });
    if (session) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.userId),
      });
      if (user) { request.user = user; return; }
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
      if (user.status !== "active") {
        reply.status(403).send({ error: "Account suspended" }); return;
      }
      if (user.isFraudFlagged) {
        reply.status(403).send({ error: "Account under review" }); return;
      }
      request.user         = user;
      request.isApiKeyAuth = true;
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
