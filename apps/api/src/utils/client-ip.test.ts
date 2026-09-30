import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import {
  parseIp,
  isInternalTokenAuth,
  resolveApiClientIp,
  resolveWebClientIp,
  trustCfConnectingIpFromEnv,
  trustedProxyHopsFromEnv,
  trustProxyByHops,
} from "./client-ip";

const DIRECT = "203.0.113.5"; // what Fastify's request.ip would report

describe("parseIp", () => {
  it("accepts IPv4 and IPv6, trims and lower-cases", () => {
    expect(parseIp(" 198.51.100.7 ")).toBe("198.51.100.7");
    expect(parseIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(parseIp("::1")).toBe("::1");
  });
  it("unwraps an IPv4-mapped IPv6 address", () => {
    expect(parseIp("::ffff:198.51.100.7")).toBe("198.51.100.7");
  });
  it("rejects junk, lists, ports, oversized and empty values", () => {
    for (const bad of ["", "   ", "unknown", "evil", "1.2.3", "256.1.1.1", "1.2.3.4, 5.6.7.8",
      "1.2.3.4:80", "<script>", "a".repeat(200), "1:2:3:4:5:6:7:8:9", ":::"]) {
      expect(parseIp(bad)).toBeUndefined();
    }
    expect(parseIp(undefined)).toBeUndefined();
    expect(parseIp(null)).toBeUndefined();
  });
  it("uses the first element of an array header", () => {
    expect(parseIp(["198.51.100.7", "1.1.1.1"])).toBe("198.51.100.7");
  });
});

describe("isInternalTokenAuth", () => {
  const token = "t".repeat(40);
  it("is true only for the exact Bearer token", () => {
    expect(isInternalTokenAuth(`Bearer ${token}`, token)).toBe(true);
    expect(isInternalTokenAuth(`Bearer ${token}x`, token)).toBe(false);
    expect(isInternalTokenAuth(`Bearer ${"u".repeat(40)}`, token)).toBe(false);
    expect(isInternalTokenAuth(token, token)).toBe(false);
  });
  it("is false when either side is missing", () => {
    expect(isInternalTokenAuth(undefined, token)).toBe(false);
    expect(isInternalTokenAuth(`Bearer ${token}`, undefined)).toBe(false);
    expect(isInternalTokenAuth(`Bearer `, "")).toBe(false);
  });
});

describe("resolveApiClientIp - direct callers (no internal token)", () => {
  it("ignores a forged X-Client-IP", () => {
    const ip = resolveApiClientIp({
      headers: { "x-client-ip": "6.6.6.6" }, requestIp: DIRECT,
      internalAuth: false, trustCfConnectingIp: false,
    });
    expect(ip).toBe(DIRECT);
  });
  it("ignores a forged x-forwarded-for on the api, always", () => {
    for (const trustCf of [true, false]) {
      const ip = resolveApiClientIp({
        headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" }, requestIp: DIRECT,
        internalAuth: false, trustCfConnectingIp: trustCf,
      });
      expect(ip).toBe(DIRECT);
    }
  });
  it("ignores a forged cf-connecting-ip when the kill switch is off", () => {
    const ip = resolveApiClientIp({
      headers: { "cf-connecting-ip": "7.7.7.7" }, requestIp: DIRECT,
      internalAuth: false, trustCfConnectingIp: false,
    });
    expect(ip).toBe(DIRECT);
  });
  it("uses cf-connecting-ip when trusted, and skips an invalid one", () => {
    expect(resolveApiClientIp({
      headers: { "cf-connecting-ip": "198.51.100.9" }, requestIp: DIRECT,
      internalAuth: false, trustCfConnectingIp: true,
    })).toBe("198.51.100.9");
    expect(resolveApiClientIp({
      headers: { "cf-connecting-ip": "not-an-ip" }, requestIp: DIRECT,
      internalAuth: false, trustCfConnectingIp: true,
    })).toBe(DIRECT);
  });
  it("falls back to 'unknown' when nothing usable exists", () => {
    expect(resolveApiClientIp({
      headers: {}, requestIp: undefined, internalAuth: false, trustCfConnectingIp: true,
    })).toBe("unknown");
  });
});

describe("resolveApiClientIp - internal-token requests", () => {
  it("uses X-Client-IP, even over cf-connecting-ip", () => {
    const ip = resolveApiClientIp({
      headers: { "x-client-ip": "198.51.100.7", "cf-connecting-ip": "76.76.21.21" },
      requestIp: DIRECT, internalAuth: true, trustCfConnectingIp: true,
    });
    expect(ip).toBe("198.51.100.7");
  });
  it("falls through to the normal chain when X-Client-IP is missing or invalid", () => {
    expect(resolveApiClientIp({
      headers: {}, requestIp: DIRECT, internalAuth: true, trustCfConnectingIp: false,
    })).toBe(DIRECT);
    expect(resolveApiClientIp({
      headers: { "x-client-ip": "1.2.3.4, 5.6.7.8" }, requestIp: DIRECT,
      internalAuth: true, trustCfConnectingIp: false,
    })).toBe(DIRECT);
  });
});

describe("trustProxyByHops", () => {
  it("trusts the first N peers (hop 0 is the socket) and no more", () => {
    const one = trustProxyByHops(1);
    expect(one("10.0.0.1", 0)).toBe(true);
    expect(one("2.2.2.2", 1)).toBe(false);
    const two = trustProxyByHops(2);
    expect(two("2.2.2.2", 1)).toBe(true);
    expect(two("1.1.1.1", 2)).toBe(false);
  });
});

describe("Fastify request.ip: a caller cannot prepend an identity", () => {
  async function ipFor(trustProxy: false | ((a: string, h: number) => boolean)): Promise<string> {
    const app = Fastify({ trustProxy });
    app.get("/ip", async (req) => ({
      ip: resolveApiClientIp({
        headers: req.headers, requestIp: req.ip, internalAuth: false, trustCfConnectingIp: false,
      }),
    }));
    const res = await app.inject({
      method: "GET", url: "/ip", remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });
    await app.close();
    return (res.json() as { ip: string }).ip;
  }

  it("with trustProxy off, request.ip is the socket peer and X-Forwarded-For is ignored", async () => {
    expect(await ipFor(false)).toBe("10.0.0.1");
  });

  it("with one trusted hop, the forged first X-Forwarded-For entry is never used", async () => {
    // Safety property, deliberately not pinned to one value: request.ip is
    // either the entry the proxy appended (2.2.2.2) or the socket peer
    // (10.0.0.1), depending on how this Fastify version applies the hop
    // rule. It must never be the entry the caller put first.
    const ip = await ipFor(trustProxyByHops(1));
    expect(ip).not.toBe("1.1.1.1");
    expect(["2.2.2.2", "10.0.0.1"]).toContain(ip);
  });
});

describe("env helpers", () => {
  it("TRUST_CF_CONNECTING_IP: only the literal 'false' turns it off", () => {
    expect(trustCfConnectingIpFromEnv({})).toBe(true);
    expect(trustCfConnectingIpFromEnv({ TRUST_CF_CONNECTING_IP: "true" })).toBe(true);
    expect(trustCfConnectingIpFromEnv({ TRUST_CF_CONNECTING_IP: "false" })).toBe(false);
  });
  it("TRUSTED_PROXY_HOPS: default 1, integer 0..5, junk falls back to 1", () => {
    expect(trustedProxyHopsFromEnv({})).toBe(1);
    expect(trustedProxyHopsFromEnv({ TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    expect(trustedProxyHopsFromEnv({ TRUSTED_PROXY_HOPS: "0" })).toBe(0);
    for (const bad of ["", "abc", "-1", "9", "1.5"]) {
      expect(trustedProxyHopsFromEnv({ TRUSTED_PROXY_HOPS: bad })).toBe(1);
    }
  });
});

describe("resolveWebClientIp", () => {
  const get = (h: Record<string, string>) => (name: string) => h[name] ?? null;

  it("on Vercel prefers x-vercel-forwarded-for, then x-real-ip, then x-forwarded-for", () => {
    expect(resolveWebClientIp(get({
      "x-vercel-forwarded-for": "198.51.100.7", "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2",
    }), { onVercel: true })).toBe("198.51.100.7");
    expect(resolveWebClientIp(get({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }),
      { onVercel: true })).toBe("1.1.1.1");
    expect(resolveWebClientIp(get({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }),
      { onVercel: true })).toBe("2.2.2.2");
  });
  it("never reads cf-connecting-ip, on or off Vercel", () => {
    for (const onVercel of [true, false]) {
      expect(resolveWebClientIp(get({ "cf-connecting-ip": "7.7.7.7" }), { onVercel })).toBeUndefined();
    }
  });
  it("off Vercel ignores x-vercel-forwarded-for and uses x-forwarded-for (E2E identities)", () => {
    expect(resolveWebClientIp(get({
      "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "10.20.0.1",
    }), { onVercel: false })).toBe("10.20.0.1");
  });
  it("returns undefined when there is no valid address", () => {
    expect(resolveWebClientIp(get({}), { onVercel: true })).toBeUndefined();
    expect(resolveWebClientIp(get({ "x-forwarded-for": "garbage" }), { onVercel: true })).toBeUndefined();
  });
});
