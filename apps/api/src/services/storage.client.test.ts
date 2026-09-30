import { describe, it, expect, vi } from "vitest";
import { createSupabaseStorageClient, ensureBuckets, resolveStorageConfig, supabaseAuthHeaders } from "./storage.client";

const cfg = { url: "https://abc.supabase.co", serviceKey: "service-role-key-0123456789" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn(async () => responses.shift() ?? json({}));
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const call = (f: any, i = 0) => ({ url: f.mock.calls[i][0] as string, init: f.mock.calls[i][1] as RequestInit });

describe("resolveStorageConfig", () => {
  it("is off when unset, partial or malformed (never throws)", () => {
    expect(resolveStorageConfig({})).toEqual({ enabled: false, reason: "not_configured" });
    expect(resolveStorageConfig({ SUPABASE_URL: "https://x.supabase.co" })).toEqual({ enabled: false, reason: "partial" });
    expect(resolveStorageConfig({ SUPABASE_URL: "not a url", SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30) })).toEqual({ enabled: false, reason: "invalid_url" });
    expect(resolveStorageConfig({ SUPABASE_URL: "http://evil.example.com", SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30) })).toEqual({ enabled: false, reason: "invalid_url" });
    expect(resolveStorageConfig({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "short" })).toEqual({ enabled: false, reason: "invalid_key" });
  });
  it("normalizes a trailing slash", () => {
    expect(resolveStorageConfig({ SUPABASE_URL: "https://x.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30) }))
      .toMatchObject({ enabled: true, url: "https://x.supabase.co" });
  });
});

describe("supabaseAuthHeaders", () => {
  it("sb_secret_ keys go in apikey only", () => {
    const k = "sb_secret_" + "a".repeat(22) + "_" + "b".repeat(8);
    expect(supabaseAuthHeaders(k)).toEqual({ apikey: k });
  });
  it("legacy JWT service_role keys go in both headers", () => {
    const k = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl";
    expect(supabaseAuthHeaders(k)).toEqual({ apikey: k, Authorization: `Bearer ${k}` });
  });
});

describe("createSupabaseStorageClient (request shapes; responses are mocked, not real)", () => {
  it("signs an upload URL and makes it absolute", async () => {
    const f = mockFetch(json({ url: "/object/upload/sign/attachments/u/c/o?token=T" }));
    const url = await createSupabaseStorageClient(cfg, f).createSignedUploadUrl("attachments", "u/c/o");
    expect(url).toBe("https://abc.supabase.co/storage/v1/object/upload/sign/attachments/u/c/o?token=T");
    const { url: reqUrl, init } = call(f);
    expect(reqUrl).toBe("https://abc.supabase.co/storage/v1/object/upload/sign/attachments/u/c/o");
    expect(init.method).toBe("POST");
    // Opaque (non-JWT) key: apikey only, no Authorization bearer.
    expect((init.headers as Record<string, string>).apikey).toBe(cfg.serviceKey);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it("signs a download URL with expiresIn", async () => {
    const f = mockFetch(json({ signedURL: "/object/sign/attachments/u/c/o?token=T" }));
    const url = await createSupabaseStorageClient(cfg, f).createSignedDownloadUrl("attachments", "u/c/o", 300);
    expect(url).toBe("https://abc.supabase.co/storage/v1/object/sign/attachments/u/c/o?token=T");
    expect(JSON.parse(call(f).init.body as string)).toEqual({ expiresIn: 300 });
  });
  it("lists by prefix to read the object size; null when absent", async () => {
    const f = mockFetch(json([{ name: "o", metadata: { size: 1234 } }]), json([]));
    const c = createSupabaseStorageClient(cfg, f);
    expect(await c.getObjectInfo("attachments", "u/c/o")).toEqual({ sizeBytes: 1234 });
    expect(JSON.parse(call(f).init.body as string)).toMatchObject({ prefix: "u/c", search: "o" });
    expect(await c.getObjectInfo("attachments", "u/c/o")).toBeNull();
  });
  it("removes with a prefixes body and skips empty lists", async () => {
    const f = mockFetch(json([]));
    const c = createSupabaseStorageClient(cfg, f);
    await c.removeObjects("audio", []);
    expect(f).not.toHaveBeenCalled();
    await c.removeObjects("audio", ["u/c/o"]);
    expect(call(f).init.method).toBe("DELETE");
    expect(JSON.parse(call(f).init.body as string)).toEqual({ prefixes: ["u/c/o"] });
  });
  it("creates a PRIVATE bucket with size and mime limits, and updates when it exists", async () => {
    const f = mockFetch(json({ message: "The resource already exists" }, 409), json({}));
    const r = await createSupabaseStorageClient(cfg, f).ensureBucket("attachments");
    expect(r).toBe("updated");
    const first = JSON.parse(call(f, 0).init.body as string);
    expect(first).toMatchObject({ id: "attachments", public: false });
    expect(first.file_size_limit).toBeGreaterThan(0);
    expect(first.allowed_mime_types).toContain("application/pdf");
    expect(call(f, 1).url).toBe("https://abc.supabase.co/storage/v1/bucket/attachments");
    expect(call(f, 1).init.method).toBe("PUT");
  });
  it("ensureBuckets covers both buckets", async () => {
    const f = mockFetch(json({}), json({}));
    expect(await ensureBuckets(createSupabaseStorageClient(cfg, f))).toEqual({ attachments: "created", audio: "created" });
  });
  it("turns HTTP and network failures into UPSTREAM without leaking the key", async () => {
    const c1 = createSupabaseStorageClient(cfg, mockFetch(json({ error: "boom" }, 500)));
    await expect(c1.createSignedUploadUrl("audio", "u/c/o")).rejects.toMatchObject({ code: "UPSTREAM" });
    const down = vi.fn(async () => { throw new Error(`connect failed ${cfg.serviceKey}`); }) as unknown as typeof fetch;
    const err = await createSupabaseStorageClient(cfg, down).removeObjects("audio", ["k"]).catch((e) => e);
    expect(err.code).toBe("UPSTREAM");
    expect(String(err.message)).not.toContain(cfg.serviceKey);
  });
});
