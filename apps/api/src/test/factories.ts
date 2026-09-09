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
  opts: { initialMicroCredits?: number; email?: string } = {}
): Promise<{ userId: string }> {
  const userId = randomUUID();
  const email = opts.email ?? `test-${userId}@example.com`;

  await db.insert(schema.users).values({
    id:           userId,
    email,
    passwordHash: "not-a-real-hash",
    status:       "active",
    emailVerified: true,
  });

  await db.insert(schema.balances).values({
    userId,
    credits: opts.initialMicroCredits ?? 0,
  });

  return { userId };
}
