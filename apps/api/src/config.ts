import { z } from "zod";

const envSchema = z.object({
  NODE_ENV:               z.enum(["development", "production", "test"]).default("development"),
  PORT:                   z.coerce.number().default(4000),
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string().url(),
  GATEWAY_URL:            z.string().url(),
  // Regular chat-completions-style API key — used for OpenAI-compatible
  // routes only (/v1/chat/completions, /v1/models).
  GATEWAY_MASTER_KEY:     z.string().min(10),
  // New API's admin/system access token — a *different* credential from
  // GATEWAY_MASTER_KEY, used only for New API's own admin routes
  // (/api/channel/, etc). The two are not interchangeable: a chat key
  // gets 401'd on /api/*, and a system token gets 401'd on /v1/*.
  GATEWAY_ROOT_TOKEN:     z.string().min(10),
  BETTER_AUTH_SECRET:     z.string().min(32),
  // Shared secret between web (Next.js) and api (Fastify) for internal calls
  INTERNAL_SERVICE_TOKEN: z.string().min(32),
  // P3.4: set ONLY during an INTERNAL_SERVICE_TOKEN rotation, on the api, to the
  // OLD token. The api then accepts both. Lenient on purpose (a blank value from
  // the dashboard must not stop boot); tokens under 32 chars are ignored.
  // Remove it when the rotation is finished (docs/runbooks/secret-rotation.md).
  INTERNAL_SERVICE_TOKEN_PREVIOUS: z.string().optional(),
  RESEND_API_KEY:         z.string().min(1),
  RESEND_FROM_EMAIL:      z.string().email(),
  RESEND_FROM_NAME:       z.string().default("AI Platform"),
  CODE_SALT:              z.string().min(16),
  TELEGRAM_BOT_TOKEN:     z.string().optional(),
  TELEGRAM_CHAT_ID:       z.string().optional(),
  // P2.2: shared secret in the URL of POST /internal/sentry-alert (Sentry webhooks cannot
  // send headers). Unset or < 24 chars => that endpoint is disabled (404).
  SENTRY_WEBHOOK_TOKEN:   z.string().min(24).optional(),
  TURNSTILE_SECRET_KEY:   z.string().optional(),
  // P3.5 (N9): Bearer token for GET /metrics. Lenient on purpose (blank must not stop boot);
  // unset or under 24 chars => /metrics is disabled in production (security/plugins.ts).
  METRICS_TOKEN:          z.string().optional(),
  // P3.5: "true" makes adminProcedure require a 2FA-enrolled admin (security/admin-2fa.ts).
  // Read from process.env at call time (it also runs inside the Vercel web app); listed
  // here for documentation and so a typo is visible next to the other secrets.
  ADMIN_REQUIRE_2FA:      z.string().optional(),
  FRONTEND_URL:           z.string().url().default("http://localhost:3000"),
  // Model id used for the internal history-summarization call (see
  // history-compaction.ts). Deliberately a separate, cheap/fast model —
  // this call is platform overhead (never billed to the user), so it
  // should never default to whatever expensive model the user picked.
  // Must be a valid id on GATEWAY_URL; not required to exist in the
  // `models` table (that table is the user-facing catalog, this is an
  // internal plumbing choice independent of it).
  SUMMARIZATION_MODEL:    z.string().min(1).default("gpt-4o-mini"),
  // P2.1 error tracking. Deliberately LENIENT (plain optional strings): a blank
  // or mistyped value must never stop the api booting (L12). The real decision
  // is monitoring/options.ts `normalizeDsn` — invalid => monitoring off + a
  // console warning. initSentry() reads process.env directly for the same
  // reason: it must work even if this schema fails.
  SENTRY_DSN:             z.string().optional(),
  SENTRY_ENVIRONMENT:     z.string().optional(),
  SENTRY_RELEASE:         z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const details = Object.entries(fieldErrors)
    .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(", ")}`)
    .join("\n");

  // IMPORTANT: this module is imported both by the standalone Fastify
  // server (apps/api) AND in-process by the Next.js app (apps/web's
  // tRPC handler re-exports the same router). `process.exit(1)` here
  // used to kill the *entire* Node process on any request that touched
  // this module — including the whole Vercel serverless function, which
  // Vercel then reports as a bare 502 to every concurrent request, with
  // no indication of which env var was the problem.
  //
  // Throwing instead lets each runtime handle it appropriately:
  //  - the Fastify server (index.ts) still crashes on boot, as intended
  //  - Next.js/tRPC turns it into a normal 500 with this message instead
  //    of nuking the whole function instance.
  console.error("❌ Invalid environment variables:\n" + details);
  throw new Error(`Invalid environment variables:\n${details}`);
}

export const config = parsed.data;
