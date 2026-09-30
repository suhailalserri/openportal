/**
 * P3.5 — security headers, CORS, body limits, /metrics guard, log redaction.
 * No database or Redis: a bare Fastify instance wired with the same building
 * blocks index.ts uses, driven through `app.inject()`.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  registerSecurity, createMetricsGuard, resolveMetricsAccess, metricsBootWarning,
  normalizeOrigin, LOG_REDACT, LOG_REDACT_PATHS,
  DEFAULT_BODY_LIMIT_BYTES, CHAT_BODY_LIMIT_BYTES, type MetricsAccess,
} from "./plugins";

const WEB = "https://app.example.com";
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((a) => a.close())); });

async function build(access: MetricsAccess = { mode: "open" }, frontendUrl = `${WEB}/`) {
  const app = Fastify({ bodyLimit: DEFAULT_BODY_LIMIT_BYTES, logger: false });
  await registerSecurity(app, { frontendUrl });
  app.get("/health", async () => ({ status: "ok" }));
  app.post("/trpc", async () => ({ ok: true }));
  app.post("/chat", { bodyLimit: CHAT_BODY_LIMIT_BYTES }, async () => ({ ok: true }));
  app.get("/metrics", { preHandler: createMetricsGuard(access) }, async () => "aip_up 1\n");
  await app.ready();
  apps.push(app);
  return app;
}

const jsonBody = (bytes: number) => JSON.stringify({ pad: "x".repeat(bytes) });
const post = (app: FastifyInstance, url: string, payload: string) =>
  app.inject({ method: "POST", url, payload, headers: { "content-type": "application/json" } });

describe("security headers", () => {
  it("sets a strict JSON-API CSP and keeps helmet's other headers", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/health" });
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("does not break the JSON response itself", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("CORS: the web origin only", () => {
  it("allows the configured origin with credentials (trailing slash in FRONTEND_URL is normalised)", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/health", headers: { origin: WEB } });
    expect(res.headers["access-control-allow-origin"]).toBe(WEB);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("never grants another origin, and never uses a wildcard", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example.net" } });
    const allowed = res.headers["access-control-allow-origin"];
    expect(allowed).not.toBe("https://evil.example.net");
    expect(allowed).not.toBe("*");
  });

  it("answers a preflight for the web origin and refuses to echo another", async () => {
    const app = await build();
    const ok = await app.inject({
      method: "OPTIONS", url: "/trpc",
      headers: { origin: WEB, "access-control-request-method": "POST" },
    });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(WEB);

    const bad = await app.inject({
      method: "OPTIONS", url: "/trpc",
      headers: { origin: "https://evil.example.net", "access-control-request-method": "POST" },
    });
    expect(bad.headers["access-control-allow-origin"]).not.toBe("https://evil.example.net");
  });

  it("normalizeOrigin strips path and trailing slash", () => {
    expect(normalizeOrigin("https://app.example.com/")).toBe(WEB);
    expect(normalizeOrigin("https://app.example.com:8443/x?y=1")).toBe("https://app.example.com:8443");
    expect(normalizeOrigin("not a url/")).toBe("not a url");
  });
});

describe("request body limits", () => {
  it("default routes reject a body over 1 MiB with 413", async () => {
    const app = await build();
    expect((await post(app, "/trpc", jsonBody(1.5 * 1024 * 1024))).statusCode).toBe(413);
    expect((await post(app, "/trpc", jsonBody(10 * 1024))).statusCode).toBe(200);
  });

  it("/chat accepts a large history but still has a ceiling (4 MiB)", async () => {
    const app = await build();
    expect((await post(app, "/chat", jsonBody(1.5 * 1024 * 1024))).statusCode).toBe(200);
    expect((await post(app, "/chat", jsonBody(4.5 * 1024 * 1024))).statusCode).toBe(413);
  });

  it("the /chat cap stays under Vercel's 4.5 MB request limit", () => {
    expect(CHAT_BODY_LIMIT_BYTES).toBeGreaterThan(DEFAULT_BODY_LIMIT_BYTES);
    expect(CHAT_BODY_LIMIT_BYTES).toBeLessThan(4.5 * 1000 * 1000);
  });
});

describe("/metrics guard (N9)", () => {
  const TOKEN = "m".repeat(32);
  const get = (app: FastifyInstance, authorization?: string) =>
    app.inject({ method: "GET", url: "/metrics", headers: authorization ? { authorization } : {} });

  it("with a token configured: 401 without it, 401 with a wrong one, 200 with the right one", async () => {
    const app = await build({ mode: "token", token: TOKEN });
    const none = await get(app);
    expect(none.statusCode).toBe(401);
    expect(none.headers["www-authenticate"]).toBe("Bearer");
    expect((await get(app, "Bearer nope")).statusCode).toBe(401);
    expect((await get(app, TOKEN)).statusCode).toBe(401);            // missing "Bearer "
    expect((await get(app, `Bearer ${TOKEN}x`)).statusCode).toBe(401);
    const ok = await get(app, `Bearer ${TOKEN}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("aip_up");
  });

  it("disabled mode answers 404 and never returns metrics", async () => {
    const res = await get(await build({ mode: "disabled" }));
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("aip_up");
  });

  it("production with no usable token resolves to disabled (fail closed)", () => {
    expect(resolveMetricsAccess(undefined, "production")).toEqual({ mode: "disabled" });
    expect(resolveMetricsAccess("", "production")).toEqual({ mode: "disabled" });
    expect(resolveMetricsAccess("short", "production")).toEqual({ mode: "disabled" });
    expect(resolveMetricsAccess(TOKEN, "production")).toEqual({ mode: "token", token: TOKEN });
  });

  it("development and test stay open so local Prometheus and other tests work", () => {
    expect(resolveMetricsAccess(undefined, "development")).toEqual({ mode: "open" });
    expect(resolveMetricsAccess(undefined, "test")).toEqual({ mode: "open" });
    expect(resolveMetricsAccess(undefined, undefined)).toEqual({ mode: "open" });
  });

  it("boot warning appears in production only, and only while /metrics is off", () => {
    expect(metricsBootWarning(undefined, "production")).toMatch(/METRICS_TOKEN/);
    expect(metricsBootWarning("short", "production")).toMatch(/shorter than 24/);
    expect(metricsBootWarning(TOKEN, "production")).toBeUndefined();
    expect(metricsBootWarning(undefined, "development")).toBeUndefined();
  });
});

describe("log redaction (second layer behind log-hygiene.test.ts)", () => {
  it("covers credentials and message content", () => {
    for (const p of ["req.headers.authorization", "req.headers.cookie", "req.body", "*.password", "*.token", "*.messages"]) {
      expect(LOG_REDACT_PATHS).toContain(p);
    }
  });

  it("censors secrets and content that reach a log call anyway", async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: { level: "info", redact: LOG_REDACT, stream: { write: (l: string) => { lines.push(l); } } },
    });
    apps.push(app);
    app.log.info({
      payload: {
        password: "SECRET-1", token: "SECRET-2", apiKey: "SECRET-3", authorization: "SECRET-4",
        messages: [{ role: "user", content: "SECRET-5" }],
      },
    }, "test");
    const out = lines.join("");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/SECRET-/);
    expect(out).toContain("[redacted]");
  });
});

describe("index.ts keeps using all of the above", () => {
  const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  it("registers the security plugins, body limits, metrics guard and redaction", () => {
    expect(src).toContain("registerSecurity(app");
    expect(src).toContain("bodyLimit: DEFAULT_BODY_LIMIT_BYTES");
    expect(src).toContain("bodyLimit: CHAT_BODY_LIMIT_BYTES");
    expect(src).toContain("preHandler: metricsGuard");
    expect(src).toContain("redact: LOG_REDACT");
  });
  it("no longer switches the CSP off or registers helmet/cors directly", () => {
    expect(src).not.toContain("contentSecurityPolicy: false");
    expect(src).not.toMatch(/app\.register\(\s*helmet/);
    expect(src).not.toMatch(/app\.register\(\s*cors/);
  });
});
