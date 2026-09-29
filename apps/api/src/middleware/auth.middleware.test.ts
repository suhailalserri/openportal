import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser, createTestSession } from "../test/factories";
import { createHash } from "node:crypto";

// touchActiveUser talks to Redis; it is fire-and-forget and irrelevant here.
vi.mock("../metrics", () => ({ touchActiveUser: vi.fn() }));

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let authMiddleware: typeof import("./auth.middleware").authMiddleware;

const INTERNAL = "internal-token-for-tests-0123456789abcdef";

beforeAll(async () => {
  await startTestDb();
  process.env.INTERNAL_SERVICE_TOKEN = INTERNAL;
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ authMiddleware } = await import("./auth.middleware"));
}, 60_000);

afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await resetTestDb(); });

/** Minimal Fastify request/reply doubles — only what authMiddleware touches. */
function fakeReply() {
  const r: any = { statusCode: 0, body: undefined, sent: false };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send   = (b: unknown) => { r.body = b; r.sent = true; return r; };
  return r;
}
const cookieReq = (token: string): any => ({ headers: {}, cookies: { "better-auth.session_token": token } });
const internalReq = (userId: string): any => ({
  headers: { authorization: `Bearer ${INTERNAL}`, "x-user-id": userId },
});
const apiKeyReq = (rawKey: string): any => ({ headers: { authorization: `Bearer ${rawKey}` } });

async function withApiKey(userId: string) {
  const rawKey = `sk-aip-${"a".repeat(48)}`;
  await db.update(schema.users)
    .set({ apiKeyHash: createHash("sha256").update(rawKey).digest("hex") })
    .where(eq(schema.users.id, userId));
  return rawKey;
}

describe("authMiddleware — account guard on all three paths (P1.1 / G2)", () => {
  it("session cookie: an active user passes", async () => {
    const { userId } = await createTestUser(db, schema);
    const { token } = await createTestSession(db, schema, userId);
    const req = cookieReq(token), reply = fakeReply();
    await authMiddleware(req, reply);
    expect(reply.sent).toBe(false);
    expect(req.user?.id).toBe(userId);
  });

  // RED on the old code: the cookie path never checked status (returned 200 / set req.user).
  it("session cookie: a SUSPENDED user is refused with 403", async () => {
    const { userId } = await createTestUser(db, schema, { status: "suspended" });
    const { token } = await createTestSession(db, schema, userId);
    const req = cookieReq(token), reply = fakeReply();
    await authMiddleware(req, reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.body).toEqual({ error: "Account suspended" });
    expect(req.user).toBeUndefined();
  });

  // RED on the old code, same reason.
  it("session cookie: a FRAUD-FLAGGED user is refused with 403", async () => {
    const { userId } = await createTestUser(db, schema, { isFraudFlagged: true });
    const { token } = await createTestSession(db, schema, userId);
    const req = cookieReq(token), reply = fakeReply();
    await authMiddleware(req, reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.body).toEqual({ error: "Account under review" });
    expect(req.user).toBeUndefined();
  });

  it("internal token: suspended and flagged users are still refused (unchanged behaviour)", async () => {
    const a = await createTestUser(db, schema, { status: "suspended" });
    const b = await createTestUser(db, schema, { isFraudFlagged: true });
    const ra = fakeReply(), rb = fakeReply();
    await authMiddleware(internalReq(a.userId), ra);
    await authMiddleware(internalReq(b.userId), rb);
    expect([ra.statusCode, ra.body]).toEqual([403, { error: "Account suspended" }]);
    expect([rb.statusCode, rb.body]).toEqual([403, { error: "Account under review" }]);
  });

  it("API key: suspended and flagged users are still refused (unchanged behaviour)", async () => {
    const a = await createTestUser(db, schema, { status: "suspended" });
    const b = await createTestUser(db, schema, { isFraudFlagged: true });
    const keyA = await withApiKey(a.userId);
    // second user needs a different key
    const keyB = `sk-aip-${"b".repeat(48)}`;
    await db.update(schema.users)
      .set({ apiKeyHash: createHash("sha256").update(keyB).digest("hex") })
      .where(eq(schema.users.id, b.userId));
    const ra = fakeReply(), rb = fakeReply();
    await authMiddleware(apiKeyReq(keyA), ra);
    await authMiddleware(apiKeyReq(keyB), rb);
    expect([ra.statusCode, ra.body]).toEqual([403, { error: "Account suspended" }]);
    expect([rb.statusCode, rb.body]).toEqual([403, { error: "Account under review" }]);
  });

  it("API key: an active user passes", async () => {
    const { userId } = await createTestUser(db, schema);
    const key = await withApiKey(userId);
    const req = apiKeyReq(key), reply = fakeReply();
    await authMiddleware(req, reply);
    expect(reply.sent).toBe(false);
    expect(req.user?.id).toBe(userId);
  });
});

describe("authMiddleware - INTERNAL_SERVICE_TOKEN rotation overlap (P3.4)", () => {
  const OLD = "old-internal-token-for-tests-0123456789abcd";
  const reqWith = (token: string, userId: string): any => ({
    headers: { authorization: `Bearer ${token}`, "x-user-id": userId },
  });

  it("accepts the previous token only while INTERNAL_SERVICE_TOKEN_PREVIOUS is set", async () => {
    const { userId } = await createTestUser(db, schema);
    try {
      process.env.INTERNAL_SERVICE_TOKEN_PREVIOUS = OLD;
      const during = reqWith(OLD, userId), r1 = fakeReply();
      await authMiddleware(during, r1);
      expect(during.isInternalAuth).toBe(true);
      expect(r1.sent).toBe(false);

      delete process.env.INTERNAL_SERVICE_TOKEN_PREVIOUS;
      const after = reqWith(OLD, userId), r2 = fakeReply();
      await authMiddleware(after, r2);
      expect(after.isInternalAuth).not.toBe(true);
      expect(after.user).toBeUndefined();
    } finally {
      delete process.env.INTERNAL_SERVICE_TOKEN_PREVIOUS;
    }
  });

  it("the current token keeps working during the overlap", async () => {
    const { userId } = await createTestUser(db, schema);
    try {
      process.env.INTERNAL_SERVICE_TOKEN_PREVIOUS = OLD;
      const req = internalReq(userId), reply = fakeReply();
      await authMiddleware(req, reply);
      expect(req.isInternalAuth).toBe(true);
    } finally {
      delete process.env.INTERNAL_SERVICE_TOKEN_PREVIOUS;
    }
  });
});
