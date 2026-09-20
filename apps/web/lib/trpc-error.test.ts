import { describe, it, expect } from "vitest";

import { isUnauthorizedError } from "./trpc-error";

describe("isUnauthorizedError", () => {
  it("matches a real TRPCClientErrorLike UNAUTHORIZED shape", () => {
    expect(
      isUnauthorizedError({
        message: "UNAUTHORIZED",
        data: { code: "UNAUTHORIZED", httpStatus: 401, path: "billing.getBalance" },
      })
    ).toBe(true);
  });

  it.each(["FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "INTERNAL_SERVER_ERROR"])(
    "rejects other tRPC error codes (%s)",
    (code) => {
      expect(isUnauthorizedError({ data: { code } })).toBe(false);
    }
  );

  it.each([
    null,
    undefined,
    "UNAUTHORIZED", // a bare string, not an error object — must not match on substring
    new Error("UNAUTHORIZED"), // plain Error with no .data at all (e.g. a network failure)
    {}, // object with no .data
    { data: null },
    { data: "UNAUTHORIZED" }, // .data present but not an object
    { data: {} }, // .data present but no .code
  ])("rejects non-matching shapes (%p)", (value) => {
    expect(isUnauthorizedError(value)).toBe(false);
  });
});
