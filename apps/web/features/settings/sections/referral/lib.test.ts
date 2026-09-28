import { describe, it, expect } from "vitest";

import { buildReferralLink } from "./lib";

describe("buildReferralLink", () => {
  it("joins the app URL and code with a ref query param", () => {
    expect(buildReferralLink("https://example.com", "ABC123")).toBe(
      "https://example.com/?ref=ABC123",
    );
  });

  it("strips a trailing slash on the app URL so the join never double-slashes", () => {
    expect(buildReferralLink("https://example.com/", "ABC123")).toBe(
      "https://example.com/?ref=ABC123",
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(buildReferralLink("https://example.com///", "ABC123")).toBe(
      "https://example.com/?ref=ABC123",
    );
  });

  it("URL-encodes special characters in the code", () => {
    expect(buildReferralLink("https://example.com", "a b/c&d")).toBe(
      "https://example.com/?ref=a%20b%2Fc%26d",
    );
  });

  it("works with a localhost dev URL", () => {
    expect(buildReferralLink("http://localhost:3000", "XYZ")).toBe(
      "http://localhost:3000/?ref=XYZ",
    );
  });

  it("with a locale, links straight to the register page so ?ref= never depends on the / redirect", () => {
    expect(buildReferralLink("https://example.com", "ABC123", "ar")).toBe(
      "https://example.com/ar/auth/register?ref=ABC123",
    );
    expect(buildReferralLink("https://example.com/", "ABC123", "en")).toBe(
      "https://example.com/en/auth/register?ref=ABC123",
    );
  });
});
