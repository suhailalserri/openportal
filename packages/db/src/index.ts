import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

/**
 * Connection sizing for a SERVERLESS deploy target (Vercel functions).
 *
 * The web log export from 2026-09-13 showed repeated 500s across every
 * new admin.* endpoint (packages, paymentMethods, manualPayments,
 * codeBatches/codeInventory), and the one row that carried an actual
 * error message made the cause explicit:
 *
 *   ERROR [Better Auth]: INTERNAL_SERVER_ERROR
 *   (EMAXCONNSESSION) max clients reached in session mode
 *   - max clients are limited to pool_size: 15
 *
 * That "session mode ... pool_size: N" phrasing is Supabase's Supavisor
 * (or any PgBouncer-alike) pooler talking. The previous config asked
 * postgres-js for up to `max: 20` connections — fine for a single
 * long-lived docker-compose container (Phase 4/19 of the master plan),
 * but fatal on Vercel: every concurrent Lambda invocation gets its own
 * process and therefore its own independent pool of up to 20
 * connections. A handful of simultaneous tRPC batch calls (a single
 * admin page load fires several) was enough to blow past a 15-connection
 * ceiling on the upstream pooler within seconds.
 *
 * Fix has two parts:
 *  1. `max: 1` here — one serverless invocation should hold at most one
 *     upstream connection, not try to run its own mini-pool. Vercel
 *     already gives you concurrency via multiple invocations; a second
 *     layer of pooling inside each one only makes the ceiling easier
 *     to blow through.
 *  2. `prepare: false` — required if DATABASE_URL points at a
 *     transaction-mode pooler (recommended for serverless; e.g.
 *     Supabase's port 6543 "Transaction" pooler, not the 5432 "Session"
 *     one this error came from). Transaction-mode pooling reassigns the
 *     underlying connection between statements, which is incompatible
 *     with postgres-js's default use of server-side prepared statements.
 *     Harmless to leave on even against a session-mode/direct connection.
 *
 * ACTION FOR YOU: if DATABASE_URL is still pointed at the session-mode
 * (port 5432) pooler endpoint, switch it to the transaction-mode
 * (typically port 6543 on Supabase) connection string. That pooler is
 * built to hand out far more logical connections than the database's
 * real connection limit, which is what a serverless deploy needs.
 * Session mode's low, fixed `pool_size` is meant for a small number of
 * long-lived clients (like the docker-compose deploy this schema was
 * originally designed for), not a fleet of short-lived Lambda functions.
 */
const client = postgres(process.env.DATABASE_URL, {
  max:             Number(process.env.DATABASE_POOL_MAX ?? 1),
  idle_timeout:    20,   // Close idle connections after 20s
  connect_timeout: 10,
  prepare:         false, // required for transaction-mode poolers (Supavisor/PgBouncer); harmless otherwise
  // Render (and most managed Postgres) require SSL on external connections.
  // The `postgres` client does not reliably auto-detect `?sslmode=require`
  // from the connection string, so it's set explicitly here. Set
  // DATABASE_SSL=disable for local Docker Postgres, which has no SSL.
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

export const db = drizzle(client, { schema, logger: process.env.NODE_ENV === "development" });

export * from "./schema";
// NOTE: MICRO_CREDIT is exported from @ai-platform/config, not here.
// Import it with: import { MICRO_CREDIT } from "@ai-platform/config"

