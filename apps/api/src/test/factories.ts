import { randomUUID } from "node:crypto";

/**
 * Creates a user + a balance row seeded with `initialMicroCredits`.
 * Takes the live `db` + schema as params (rather than importing
 * "@ai-platform/db" itself) so it stays subject to the same
 * dynamic-import-after-startTestDb() ordering as everything else — see
 * testDb.ts for why a static import here would break the suite.
 */
export async function createTestUser(
  db: any,
  schema: any,
  opts: {
    initialMicroCredits?: number;
    email?: string;
    status?: "active" | "suspended" | "pending_verification";
    role?: "user" | "admin" | "superadmin";
    isFraudFlagged?: boolean;
  } = {}
): Promise<{ userId: string }> {
  const userId = randomUUID();
  const email = opts.email ?? `test-${userId}@example.com`;

  await db.insert(schema.users).values({
    id:           userId,
    email,
    passwordHash: "not-a-real-hash",
    status:       opts.status ?? "active",
    role:         opts.role ?? "user",
    isFraudFlagged: opts.isFraudFlagged ?? false,
    emailVerified: true,
  });

  await db.insert(schema.balances).values({
    userId,
    credits: opts.initialMicroCredits ?? 0,
  });

  return { userId };
}

/**
 * Inserts a live better-auth session row for `userId` and returns its token
 * (the value better-auth puts in the `better-auth.session_token` cookie).
 */
export async function createTestSession(
  db: any,
  schema: any,
  userId: string,
  opts: { expiresInMs?: number } = {}
): Promise<{ token: string; id: string }> {
  const id    = randomUUID();
  const token = `tok_${randomUUID()}`;
  await db.insert(schema.sessions).values({
    id,
    token,
    userId,
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000)),
  });
  return { token, id };
}
