import { describe, it, expect } from "vitest";
import { isInternalTokenAuth } from "./client-ip";
import { isAuthorizedSmokeTest } from "../monitoring/smoke-test";

/**
 * P3.4 - INTERNAL_SERVICE_TOKEN rotation overlap. The api accepts the current
 * token and, only while INTERNAL_SERVICE_TOKEN_PREVIOUS is set to a real
 * secret, the old one. Nothing else.
 */
const NEW = "n".repeat(40);
const OLD = "o".repeat(40);

describe("isInternalTokenAuth with a previous token", () => {
  it("accepts the current token and the previous token", () => {
    expect(isInternalTokenAuth(`Bearer ${NEW}`, NEW, OLD)).toBe(true);
    expect(isInternalTokenAuth(`Bearer ${OLD}`, NEW, OLD)).toBe(true);
  });
  it("after the rotation (no previous) the old token is refused", () => {
    expect(isInternalTokenAuth(`Bearer ${OLD}`, NEW, undefined)).toBe(false);
    expect(isInternalTokenAuth(`Bearer ${OLD}`, NEW)).toBe(false);
  });
  it("a blank previous token accepts nothing (Render can save an empty value)", () => {
    expect(isInternalTokenAuth("Bearer ", NEW, "")).toBe(false);
    expect(isInternalTokenAuth("Bearer", NEW, "")).toBe(false);
    expect(isInternalTokenAuth("", NEW, "")).toBe(false);
  });
  it("a previous token under 32 chars is ignored, even if presented", () => {
    expect(isInternalTokenAuth("Bearer short", NEW, "short")).toBe(false);
    expect(isInternalTokenAuth(`Bearer ${"x".repeat(31)}`, NEW, "x".repeat(31))).toBe(false);
  });
  it("rejects a token that matches neither, and a wrong scheme", () => {
    expect(isInternalTokenAuth(`Bearer ${"z".repeat(40)}`, NEW, OLD)).toBe(false);
    expect(isInternalTokenAuth(`Bearer ${OLD}x`, NEW, OLD)).toBe(false);
    expect(isInternalTokenAuth(OLD, NEW, OLD)).toBe(false);
    expect(isInternalTokenAuth(undefined, NEW, OLD)).toBe(false);
    expect(isInternalTokenAuth([`Bearer ${OLD}`], NEW, OLD)).toBe(false);
  });
  it("no current token configured: still refuses everything but a valid previous", () => {
    expect(isInternalTokenAuth(`Bearer ${NEW}`, undefined, OLD)).toBe(false);
    expect(isInternalTokenAuth("Bearer ", undefined, undefined)).toBe(false);
  });
  it("previous equal to current changes nothing", () => {
    expect(isInternalTokenAuth(`Bearer ${NEW}`, NEW, NEW)).toBe(true);
    expect(isInternalTokenAuth(`Bearer ${OLD}`, NEW, NEW)).toBe(false);
  });
});

describe("isAuthorizedSmokeTest with a previous token", () => {
  it("accepts current and previous; refuses previous when unset, blank or short", () => {
    expect(isAuthorizedSmokeTest(`Bearer ${NEW}`, NEW, OLD)).toBe(true);
    expect(isAuthorizedSmokeTest(`Bearer ${OLD}`, NEW, OLD)).toBe(true);
    expect(isAuthorizedSmokeTest(`Bearer ${OLD}`, NEW, undefined)).toBe(false);
    expect(isAuthorizedSmokeTest(`Bearer ${OLD}`, NEW, "")).toBe(false);
    expect(isAuthorizedSmokeTest("Bearer short", NEW, "short")).toBe(false);
    expect(isAuthorizedSmokeTest(`Bearer ${"z".repeat(40)}`, NEW, OLD)).toBe(false);
  });
});
