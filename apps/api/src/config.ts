import { z } from "zod";

const envSchema = z.object({
  NODE_ENV:               z.enum(["development", "production", "test"]).default("development"),
  PORT:                   z.coerce.number().default(4000),
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string().url(),
  GATEWAY_URL:            z.string().url(),
  GATEWAY_MASTER_KEY:     z.string().min(10),
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
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
