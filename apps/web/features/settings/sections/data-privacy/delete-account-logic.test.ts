import { describe, it, expect } from "vitest";

import { resolveDeleteAccountFailure } from "./delete-account-logic";

describe("resolveDeleteAccountFailure — from the password step", () => {
  it("TWO_FACTOR_REQUIRED advances to the 2FA step with no error shown", () => {
    expect(resolveDeleteAccountFailure("password", "TWO_FACTOR_REQUIRED")).toEqual({
      nextStep: "twoFactor",
      error: null,
    });
  });

  it("INCORRECT_PASSWORD stays on the password step and shows the error", () => {
    expect(resolveDeleteAccountFailure("password", "INCORRECT_PASSWORD")).toEqual({
      nextStep: "password",
      error: "INCORRECT_PASSWORD",
    });
  });

  it("TOO_MANY_ATTEMPTS stays on the password step and shows the error", () => {
    expect(resolveDeleteAccountFailure("password", "TOO_MANY_ATTEMPTS")).toEqual({
      nextStep: "password",
      error: "TOO_MANY_ATTEMPTS",
    });
  });

  it("GENERIC stays on the password step and shows the error", () => {
    expect(resolveDeleteAccountFailure("password", "GENERIC")).toEqual({
      nextStep: "password",
      error: "GENERIC",
    });
  });

  it("defensive: INVALID_TWO_FACTOR_CODE also advances to the 2FA step (server should not send this from here today)", () => {
    expect(resolveDeleteAccountFailure("password", "INVALID_TWO_FACTOR_CODE")).toEqual({
      nextStep: "twoFactor",
      error: null,
    });
  });
});

describe("resolveDeleteAccountFailure — from the twoFactor step", () => {
  it("INVALID_TWO_FACTOR_CODE stays on the 2FA step and shows the error", () => {
    expect(resolveDeleteAccountFailure("twoFactor", "INVALID_TWO_FACTOR_CODE")).toEqual({
      nextStep: "twoFactor",
      error: "INVALID_TWO_FACTOR_CODE",
    });
  });

  it("TOO_MANY_ATTEMPTS stays on the 2FA step and shows the error", () => {
    expect(resolveDeleteAccountFailure("twoFactor", "TOO_MANY_ATTEMPTS")).toEqual({
      nextStep: "twoFactor",
      error: "TOO_MANY_ATTEMPTS",
    });
  });

  it("TWO_FACTOR_REQUIRED (shouldn't happen once code is being sent) still resolves to the 2FA step with no error", () => {
    expect(resolveDeleteAccountFailure("twoFactor", "TWO_FACTOR_REQUIRED")).toEqual({
      nextStep: "twoFactor",
      error: null,
    });
  });
});
