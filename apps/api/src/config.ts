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
  RESEND_API_KEY:         z.string().min(1),
  RESEND_FROM_EMAIL:      z.string().email(),
  RESEND_FROM_NAME:       z.string().default("AI Platform"),
  CODE_SALT:              z.string().min(16),
  TELEGRAM_BOT_TOKEN:     z.string().optional(),
  TELEGRAM_CHAT_ID:       z.string().optional(),
  TURNSTILE_SECRET_KEY:   z.string().optional(),
  MINIO_ENDPOINT:         z.string().optional(),
  MINIO_ACCESS_KEY:       z.string().optional(),
  MINIO_SECRET_KEY:       z.string().optional(),
  FRONTEND_URL:           z.string().url().default("http://localhost:3000"),
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
