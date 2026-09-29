import { describe, it, expect, vi, beforeEach } from "vitest";

// The helper only needs: db.query.users.findFirst, and the pure guard.
const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@ai-platform/db", () => ({
  db:    { query: { users: { findFirst } } },
  users: { id: "users.id" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "eq") }));

import { rejectUnusableAccount } from "./account-guard-server";

beforeEach(() => findFirst.mockReset());

describe("rejectUnusableAccount", () => {
  it("returns null for an active, unflagged user", async () => {
    findFirst.mockResolvedValue({ status: "active", isFraudFlagged: false });
    expect(await rejectUnusableAccount("u1")).toBeNull();
  });

  it("returns 403 ACCOUNT_SUSPENDED for a suspended user", async () => {
    findFirst.mockResolvedValue({ status: "suspended", isFraudFlagged: false });
    const res = await rejectUnusableAccount("u1");
    expect(res?.status).toBe(403);
    expect(await res!.json()).toEqual({ error: "Account suspended", code: "ACCOUNT_SUSPENDED" });
  });

  it("returns 403 ACCOUNT_UNDER_REVIEW for a fraud-flagged user", async () => {
    findFirst.mockResolvedValue({ status: "active", isFraudFlagged: true });
    const res = await rejectUnusableAccount("u1");
    expect(res?.status).toBe(403);
    expect(await res!.json()).toEqual({ error: "Account under review", code: "ACCOUNT_UNDER_REVIEW" });
  });

  it("fails closed: a missing user row is 401", async () => {
    findFirst.mockResolvedValue(undefined);
    expect((await rejectUnusableAccount("gone"))?.status).toBe(401);
  });

  it("fails closed: a DB error propagates instead of letting the request through", async () => {
    // A synchronous throw inside the mock becomes a rejection of the async
    // function under test. Nothing here creates a promise that could reject
    // before something is attached to it, so it cannot surface as an
    // unhandled rejection (which vitest reports as a failure of this test).
    findFirst.mockImplementation(() => { throw new Error("db down"); });

    let caught: unknown;
    let result: unknown = "not-settled";
    try {
      result = await rejectUnusableAccount("u1");
    } catch (err) {
      caught = err;
    }
    expect(result).toBe("not-settled"); // never resolved to null (= request allowed)
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("db down");
  });
});
