import { describe, it, expect } from "vitest";

import { checkPasswordRules, isValidPassword, PASSWORD_MIN_LENGTH } from "./password-rules";

describe("checkPasswordRules", () => {
  it("accepts a password meeting all three rules", () => {
    expect(checkPasswordRules("Abcdefg1")).toEqual({ valid: true, failedRules: [] });
  });

  it("flags a password under the minimum length", () => {
    expect(checkPasswordRules("Ab1")).toEqual({ valid: false, failedRules: ["minLength"] });
  });

  it("flags a missing uppercase letter", () => {
    expect(checkPasswordRules("abcdefg1")).toEqual({ valid: false, failedRules: ["uppercase"] });
  });

  it("flags a missing digit", () => {
    expect(checkPasswordRules("Abcdefgh")).toEqual({ valid: false, failedRules: ["digit"] });
  });

  it("flags multiple failed rules at once, in a stable order", () => {
    expect(checkPasswordRules("ab")).toEqual({
      valid: false,
      failedRules: ["minLength", "uppercase", "digit"],
    });
  });

  it("accepts exactly the minimum length", () => {
    const eightChars = `Abcdefg1`;
    expect(eightChars.length).toBe(PASSWORD_MIN_LENGTH);
    expect(checkPasswordRules(eightChars).valid).toBe(true);
  });

  it("empty string fails every rule", () => {
    expect(checkPasswordRules("")).toEqual({
      valid: false,
      failedRules: ["minLength", "uppercase", "digit"],
    });
  });
});

describe("isValidPassword", () => {
  it("is a boolean convenience over checkPasswordRules", () => {
    expect(isValidPassword("Abcdefg1")).toBe(true);
    expect(isValidPassword("weak")).toBe(false);
  });
});
