import { describe, it, expect } from "vitest";
import { isAuthorizedSentryWebhook, formatSentryAlert } from "./sentry-webhook";
import { createGatewayProbe } from "./gateway-health";

const TOKEN = "t".repeat(32);

describe("sentry webhook auth", () => {
  it("accepts only the exact token", () => {
    expect(isAuthorizedSentryWebhook(TOKEN, TOKEN)).toBe(true);
    expect(isAuthorizedSentryWebhook("x".repeat(32), TOKEN)).toBe(false);
    expect(isAuthorizedSentryWebhook(undefined, TOKEN)).toBe(false);
    expect(isAuthorizedSentryWebhook(["a"], TOKEN)).toBe(false);
  });
  it("is OFF when no/short token is configured (fail closed)", () => {
    expect(isAuthorizedSentryWebhook("anything", undefined)).toBe(false);
    expect(isAuthorizedSentryWebhook("short", "short")).toBe(false);
  });
});

describe("formatSentryAlert", () => {
  it("issue-alert shape", () => {
    const r = formatSentryAlert({
      action: "triggered",
      data: { event: { title: "TypeError: x is undefined", web_url: "https://sentry.io/organizations/o/issues/1/", level: "error" },
              triggered_rule: "New error" },
    });
    expect(r.message).toContain("TypeError: x is undefined");
    expect(r.message).toContain("Rule: New error");
    expect(r.message).toContain("https://sentry.io/organizations/o/issues/1/");
    expect(r.level).toBe("warning");
  });
  it("legacy webhook shape + fatal => critical", () => {
    const r = formatSentryAlert({ project_name: "api", message: "Boom", url: "https://sentry.io/x", level: "fatal" });
    expect(r.message).toContain("Boom");
    expect(r.message).toContain("Project: api");
    expect(r.level).toBe("critical");
  });
  it("unknown / empty payloads still produce a message", () => {
    expect(formatSentryAlert(null).message).toContain("unrecognised payload");
    expect(formatSentryAlert("garbage").message).toContain("Sentry");
  });
  it("forwards only title/rule/project/url (no event payload leaks)", () => {
    const r = formatSentryAlert({ data: { event: { title: "T", request: { cookies: "SECRET-COOKIE" }, user: { email: "a@b.com" } } } });
    expect(r.message.includes("SECRET-COOKIE")).toBe(false);
    expect(r.message.includes("a@b.com")).toBe(false);
  });
  it("truncates very long titles", () => {
    expect(formatSentryAlert({ message: "x".repeat(5000) }).message.length < 400).toBe(true);
  });
});

describe("gateway probe (/health/gateway)", () => {
  const mk = (status: number | Error, over: Partial<Parameters<typeof createGatewayProbe>[0]> = {}) => {
    let t = 0; let calls = 0;
    const fetchImpl = (async () => { calls++; if (status instanceof Error) throw status; return { status }; }) as unknown as typeof fetch;
    const probe = createGatewayProbe({ url: "http://g/api/status", fetchImpl, now: () => t, ...over });
    return { probe, calls: () => calls, advance: (ms: number) => { t += ms; } };
  };
  it("2xx, 3xx and 401 mean up; 500 and network errors mean down", async () => {
    expect(await mk(200).probe.isUp()).toBe(true);
    expect(await mk(401).probe.isUp()).toBe(true);
    expect(await mk(502).probe.isUp()).toBe(false);
    expect(await mk(new Error("ECONNREFUSED")).probe.isUp()).toBe(false);
  });
  it("caches for 30 s so the public route cannot hammer the gateway", async () => {
    const m = mk(200);
    await m.probe.isUp(); await m.probe.isUp(); await m.probe.isUp();
    expect(m.calls()).toBe(1);
    m.advance(31_000);
    await m.probe.isUp();
    expect(m.calls()).toBe(2);
  });
  it("concurrent callers share one in-flight probe", async () => {
    const m = mk(200);
    await Promise.all([m.probe.isUp(), m.probe.isUp(), m.probe.isUp()]);
    expect(m.calls()).toBe(1);
  });
});
