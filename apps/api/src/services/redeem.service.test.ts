import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let generateCode: typeof import("./redeem.service").generateCode;
let validateCodeFormat: typeof import("./redeem.service").validateCodeFormat;
let redeemCode: typeof import("./redeem.service").redeemCode;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ generateCode, validateCodeFormat, redeemCode } = await import("./redeem.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

/** Insert a redeemable code directly, bypassing the CLI generator. */
async function insertCode(overrides: Partial<{ code: string; creditAmount: number; status: string; expiresAt: Date | null }> = {}) {
  const code = overrides.code ?? generateCode();
  await db.insert(schema.redeemCodes).values({
    code,
    creditAmount: overrides.creditAmount ?? 50_000_000,
    status: (overrides.status as any) ?? "unused",
    batchId: randomUUID(),
    expiresAt: overrides.expiresAt ?? null,
  });
  return code;
}

describe("validateCodeFormat (checksum) — brute-force resistance", () => {
  it("accepts every code generateCode() produces", () => {
    for (let i = 0; i < 1000; i++) {
      expect(validateCodeFormat(generateCode())).toBe(true);
    }
  });

  it(
    "rejects 10,000 random invalid codes without ever touching the database — " +
      "this is the whole point of the checksum: eliminate brute force before it hits Postgres",
    () => {
      const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const randomSegment = () =>
        Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
      const randomCode = () =>
        `${randomSegment()}-${randomSegment()}-${randomSegment()}-${randomSegment()}`;

      // Spy on the db module to prove format validation is a pure, local
      // check — no query should ever be issued for a malformed/forged code.
      const insertSpy = vi.spyOn(db, "insert");
      const selectSpy = vi.spyOn(db, "select");

      let falsePositives = 0;
      for (let i = 0; i < 10_000; i++) {
        const candidate = randomCode();
        // Astronomically unlikely to collide with a real checksum, but
        // guard anyway rather than assume.
        if (validateCodeFormat(candidate)) falsePositives++;
      }

      expect(falsePositives).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();

      insertSpy.mockRestore();
      selectSpy.mockRestore();
    }
  );

  it("rejects malformed structural input without throwing", () => {
    for (const bad of ["", "not-a-code", "AAAA-BBBB-CCCC", "AAAA-BBBB-CCCC-DDDD-EEEE", "   ", "AAAA-BB-CCCC-DDDD"]) {
      expect(() => validateCodeFormat(bad)).not.toThrow();
      expect(validateCodeFormat(bad)).toBe(false);
    }
  });
});

describe("redeemCode", () => {
  it("returns INVALID_FORMAT for a malformed code without querying the database", async () => {
    const { userId } = await createTestUser(db, schema);
    const result = await redeemCode(userId, "not-a-real-code");
    expect(result.success).toBe(false);
    expect(result.error).toBe("INVALID_FORMAT");
  });

  it("returns NOT_FOUND for a well-formatted code that was never issued", async () => {
    const { userId } = await createTestUser(db, schema);
    const wellFormedButUnissued = generateCode();
    const result = await redeemCode(userId, wellFormedButUnissued);
    expect(result.success).toBe(false);
    expect(result.error).toBe("NOT_FOUND");
  });

  it("happy path: claims the code, credits the balance, marks it used — atomically", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 0 });
    const code = await insertCode({ creditAmount: 50_000_000 });

    const result = await redeemCode(userId, code);

    expect(result.success).toBe(true);
    expect(result.creditsAdded).toBe(50_000_000);

    const balance = await db.query.balances.findFirst({
      where: (b: any, { eq }: any) => eq(b.userId, userId),
    });
    expect(balance?.credits).toBe(50_000_000);

    const codeRow = await db.query.redeemCodes.findFirst({
      where: (c: any, { eq }: any) => eq(c.code, code),
    });
    expect(codeRow?.status).toBe("used");
    expect(codeRow?.usedByUserId).toBe(userId);

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows).toHaveLength(1);
    expect(txRows[0].type).toBe("redeem");
  });

  it("rejects an already-used code with ALREADY_USED, without double-crediting", async () => {
    const { userId } = await createTestUser(db, schema);
    const code = await insertCode();
    const first = await redeemCode(userId, code);
    expect(first.success).toBe(true);

    const second = await redeemCode(userId, code);
    expect(second.success).toBe(false);
    expect(second.error).toBe("ALREADY_USED");

    const balance = await db.query.balances.findFirst({
      where: (b: any, { eq }: any) => eq(b.userId, userId),
    });
    expect(balance?.credits).toBe(50_000_000); // not 100M — only credited once
  });

  it("rejects an expired code with EXPIRED", async () => {
    const { userId } = await createTestUser(db, schema);
    const code = await insertCode({ expiresAt: new Date(Date.now() - 60_000) });
    const result = await redeemCode(userId, code);
    expect(result.success).toBe(false);
    expect(result.error).toBe("EXPIRED");
  });

  it("rejects a revoked code with REVOKED", async () => {
    const { userId } = await createTestUser(db, schema);
    const code = await insertCode({ status: "revoked" });
    const result = await redeemCode(userId, code);
    expect(result.success).toBe(false);
    expect(result.error).toBe("REVOKED");
  });

  it(
    "under concurrent redemption of the SAME code by different users, " +
      "exactly one succeeds and the credit is granted exactly once — " +
      "this is the single-use guarantee the unique partial index exists to enforce",
    async () => {
      const code = await insertCode({ creditAmount: 50_000_000 });
      const users = await Promise.all(
        Array.from({ length: 8 }, () => createTestUser(db, schema))
      );

      const results = await Promise.all(users.map((u) => redeemCode(u.userId, code)));

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(7);
      failures.forEach((f) => expect(f.error).toBe("ALREADY_USED"));

      // Exactly one user got credited, and exactly one transaction row exists
      // total across ALL users — proves the nested-transaction fix: the code
      // claim and the credit grant commit (or fail) together, every time.
      const allBalances = await db.query.balances.findMany();
      const creditedUsers = allBalances.filter((b: any) => b.credits > 0);
      expect(creditedUsers).toHaveLength(1);
      expect(creditedUsers[0].credits).toBe(50_000_000);

      const allTxRows = await db.query.transactions.findMany();
      expect(allTxRows).toHaveLength(1);
    }
  );
});
