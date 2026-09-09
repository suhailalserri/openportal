import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(process.env.DATABASE_URL, {
  max:             20,   // Max connections in pool
  idle_timeout:    20,   // Close idle connections after 20s
  connect_timeout: 10,
});

export const db = drizzle(client, { schema, logger: process.env.NODE_ENV === "development" });

export * from "./schema";
// NOTE: MICRO_CREDIT is exported from @ai-platform/config, not here.
// Import it with: import { MICRO_CREDIT } from "@ai-platform/config"
