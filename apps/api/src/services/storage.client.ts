/**
 * P5.1: server-only wrapper around Supabase Storage's REST API (plain fetch, so no new
 * dependency and no lockfile change). The service-role key lives ONLY here and in config.ts;
 * it is never logged, returned, or sent to a browser. Browsers only ever receive signed URLs.
 *
 * L12: storage is optional. With SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing or malformed
 * `getStorageClient()` returns null and the api boots and serves chat exactly as before.
 *
 * Keys: both the legacy JWT `service_role` key and the new `sb_secret_...` key are accepted (see
 * supabaseAuthHeaders). The sb_secret_ path is NOT verified against a live project.
 *
 * NOT VERIFIED against a live project (no network in the build sandbox): endpoint paths and
 * response shapes below are from Supabase's documented Storage REST API / supabase-js, written
 * from memory. Every call is covered by a mocked-fetch test of the request we send, not by a
 * real response. First real check: docs/runbooks/STORAGE.md section 4.
 */
import { BUCKETS, BUCKET_NAMES, StorageError, type BucketName } from "./storage.policy";

export interface StorageClient {
  /** Creates the private bucket, or updates its limits if it already exists. */
  ensureBucket(name: BucketName): Promise<"created" | "updated">;
  /** Signed URL the browser PUTs the file to. Supabase fixes its lifetime (about 2 h). */
  createSignedUploadUrl(bucket: BucketName, key: string): Promise<string>;
  createSignedDownloadUrl(bucket: BucketName, key: string, expiresInSeconds: number): Promise<string>;
  /** null = the object does not exist (yet). */
  getObjectInfo(bucket: BucketName, key: string): Promise<{ sizeBytes: number } | null>;
  /** Idempotent: removing a missing object is not an error. */
  removeObjects(bucket: BucketName, keys: string[]): Promise<void>;
}

export type StorageConfigResult =
  | { enabled: true; url: string; serviceKey: string }
  | { enabled: false; reason: "not_configured" | "partial" | "invalid_url" | "invalid_key" };

export function resolveStorageConfig(env: Record<string, string | undefined>): StorageConfigResult {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url && !key) return { enabled: false, reason: "not_configured" };
  if (!url || !key) return { enabled: false, reason: "partial" };
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      return { enabled: false, reason: "invalid_url" };
    }
  } catch {
    return { enabled: false, reason: "invalid_url" };
  }
  if (key.length < 20) return { enabled: false, reason: "invalid_key" };
  return { enabled: true, url: url.replace(/\/+$/, ""), serviceKey: key };
}

const TIMEOUT_MS = 10_000;

/**
 * Supabase's new `sb_secret_...` keys are opaque strings, not JWTs, and belong in `apikey` only
 * (Supabase docs: "Authorization headers"). Only a legacy JWT `service_role` key may also go in
 * `Authorization: Bearer`. Sending an opaque key as a bearer token risks a 401.
 */
export function supabaseAuthHeaders(serviceKey: string): Record<string, string> {
  const isJwt = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(serviceKey);
  return isJwt ? { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } : { apikey: serviceKey };
}

function absolutize(base: string, p: string): string {
  if (/^https?:\/\//i.test(p)) return p;
  const path = p.startsWith("/") ? p : `/${p}`;
  return path.startsWith("/storage/v1") ? `${base}${path}` : `${base}/storage/v1${path}`;
}

export function createSupabaseStorageClient(
  cfg: { url: string; serviceKey: string },
  fetchImpl: typeof fetch = fetch,
): StorageClient {
  const api = `${cfg.url}/storage/v1`;

  async function call(op: string, path: string, init: { method: string; body?: unknown }): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${api}${path}`, {
        method: init.method,
        headers: {
          ...supabaseAuthHeaders(cfg.serviceKey),
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        // exactOptionalPropertyTypes: omit `body` entirely instead of passing undefined.
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new StorageError("UPSTREAM", `storage ${op}: ${err instanceof Error ? err.name : "network error"}`);
    }
    return res;
  }

  async function failure(op: string, res: Response): Promise<StorageError> {
    // Status + a short body excerpt only. Never the request (it carries the key).
    const text = await res.text().catch(() => "");
    return new StorageError("UPSTREAM", `storage ${op}: HTTP ${res.status} ${text.slice(0, 200)}`.trim());
  }

  const enc = (key: string) => key.split("/").map(encodeURIComponent).join("/");

  return {
    async ensureBucket(name) {
      const policy = BUCKETS[name];
      const settings = {
        public: false,
        file_size_limit: policy.maxBytes,
        allowed_mime_types: [...policy.allowedMimes],
      };
      const created = await call("createBucket", "/bucket", { method: "POST", body: { id: name, name, ...settings } });
      if (created.ok) return "created";
      const text = await created.text().catch(() => "");
      if (created.status === 409 || /already exists|duplicate/i.test(text)) {
        const updated = await call("updateBucket", `/bucket/${encodeURIComponent(name)}`, { method: "PUT", body: settings });
        if (!updated.ok) throw await failure("updateBucket", updated);
        return "updated";
      }
      throw new StorageError("UPSTREAM", `storage createBucket: HTTP ${created.status} ${text.slice(0, 200)}`.trim());
    },

    async createSignedUploadUrl(bucket, key) {
      const res = await call("signUpload", `/object/upload/sign/${bucket}/${enc(key)}`, { method: "POST", body: {} });
      if (!res.ok) throw await failure("signUpload", res);
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!json?.url) throw new StorageError("UPSTREAM", "storage signUpload: no url in response");
      return absolutize(cfg.url, json.url);
    },

    async createSignedDownloadUrl(bucket, key, expiresInSeconds) {
      const res = await call("signDownload", `/object/sign/${bucket}/${enc(key)}`, {
        method: "POST", body: { expiresIn: expiresInSeconds },
      });
      if (!res.ok) throw await failure("signDownload", res);
      const json = (await res.json().catch(() => null)) as { signedURL?: string } | null;
      if (!json?.signedURL) throw new StorageError("UPSTREAM", "storage signDownload: no signedURL in response");
      return absolutize(cfg.url, json.signedURL);
    },

    async getObjectInfo(bucket, key) {
      const i = key.lastIndexOf("/");
      const prefix = key.slice(0, i);
      const name = key.slice(i + 1);
      const res = await call("list", `/object/list/${bucket}`, {
        method: "POST", body: { prefix, limit: 10, offset: 0, search: name },
      });
      if (!res.ok) throw await failure("list", res);
      const items = (await res.json().catch(() => null)) as Array<{ name?: string; metadata?: { size?: number } | null }> | null;
      const hit = Array.isArray(items) ? items.find((o) => o.name === name) : undefined;
      if (!hit) return null;
      const size = hit.metadata?.size;
      return typeof size === "number" ? { sizeBytes: size } : null;
    },

    async removeObjects(bucket, keys) {
      if (keys.length === 0) return;
      const res = await call("remove", `/object/${bucket}`, { method: "DELETE", body: { prefixes: keys } });
      if (!res.ok) throw await failure("remove", res);
    },
  };
}

/** Bucket setup, idempotent. Returns per-bucket results; throws on the first failure. */
export async function ensureBuckets(client: StorageClient): Promise<Record<BucketName, "created" | "updated">> {
  const out = {} as Record<BucketName, "created" | "updated">;
  for (const name of BUCKET_NAMES) out[name] = await client.ensureBucket(name);
  return out;
}

let cached: { client: StorageClient | null } | undefined;

/** Process-wide client built from env, or null when storage is not configured. */
export function getStorageClient(): StorageClient | null {
  if (!cached) {
    const cfg = resolveStorageConfig(process.env);
    if (!cfg.enabled && cfg.reason !== "not_configured") {
      console.warn(`[storage] Supabase storage disabled: configuration is ${cfg.reason}. Chat is unaffected.`);
    }
    cached = { client: cfg.enabled ? createSupabaseStorageClient(cfg) : null };
  }
  return cached.client;
}

/** Test hook. */
export function resetStorageClientForTests(): void { cached = undefined; }
