import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SQL } from "drizzle-orm";
import { startTestDb, stopTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

// Migration 0025 (repair JSON stored as a JSON string) and the `jsonbValue` column type, against a real PostgreSQL.
let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let orm: typeof import("drizzle-orm");
let adminId: string;

const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/db/src/migrations/0025_repair_double_encoded_jsonb.sql");

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  orm = await import("drizzle-orm");
  adminId = (await createTestUser(db, schema, { role: "admin" })).userId;
}, 60_000);
afterAll(async () => { await stopTestDb(); });

const rows = async <T,>(q: SQL) => (await db.execute(q)) as unknown as T[];
const runMigration = () => db.execute(orm.sql.raw(fs.readFileSync(MIGRATION, "utf-8")));

/** jsonb_typeof of one column of one row; null when the column is SQL NULL. */
async function kind(table: "fraud_events" | "audit_logs" | "models", col: string, id: string): Promise<string | null> {
  const r = await rows<{ t: string | null }>(orm.sql.raw(`SELECT jsonb_typeof(${col}) AS t FROM ${table} WHERE id = '${id}'`));
  return r[0]!.t;
}

describe("migration 0025 + jsonbValue", () => {
  const ids = {
    fraud: randomUUID(),
    auditRepair: randomUUID(), auditSpace: randomUUID(), auditKeep: randomUUID(), auditObj: randomUUID(),
    modelRepair: `m-repair-${randomUUID()}`, modelDefault: `m-default-${randomUUID()}`, modelArrayString: `m-arr-${randomUUID()}`,
  };

  it("the column decodes every shape a driver can hand back, including the legacy double-encoded one", () => {
    const col = schema.auditLogs.before;
    expect(col.mapFromDriverValue({ a: 1 })).toEqual({ a: 1 });
    expect(col.mapFromDriverValue('{"a":1}')).toEqual({ a: 1 });
    expect(col.mapFromDriverValue(JSON.stringify('{"a":1}'))).toEqual({ a: 1 });   // legacy, driver gave raw text
    expect(col.mapFromDriverValue("hello")).toBe("hello");
    expect(col.mapFromDriverValue("{oops")).toBe("{oops");
    expect(col.mapFromDriverValue(null)).toBeNull();
  });

  it("seeds legacy rows exactly as the old code stored them (a jsonb STRING containing the JSON)", async () => {
    await db.execute(orm.sql`INSERT INTO fraud_events (id, type, severity, details)
      VALUES (${ids.fraud}, 'SUSPICIOUS_PATTERN', 'low', to_jsonb(${'{"ip":"1.2.3.4","n":3}'}::text))`);
    await db.execute(orm.sql`INSERT INTO audit_logs (id, admin_id, action, before, after)
      VALUES (${ids.auditRepair}, ${adminId}, 'legacy', to_jsonb(${'{"x":1}'}::text), to_jsonb(${'[1,2]'}::text))`);
    await db.execute(orm.sql`INSERT INTO audit_logs (id, admin_id, action, before, after)
      VALUES (${ids.auditSpace}, ${adminId}, 'legacy', to_jsonb(${' \n{"w":1}'}::text), NULL)`);
    // a genuine JSON string, and text that starts with { but is not JSON: both must be left alone
    await db.execute(orm.sql`INSERT INTO audit_logs (id, admin_id, action, before, after)
      VALUES (${ids.auditKeep}, ${adminId}, 'legacy', to_jsonb(${'hello'}::text), to_jsonb(${'{oops'}::text))`);
    await db.execute(orm.sql`INSERT INTO audit_logs (id, admin_id, action, before, after)
      VALUES (${ids.auditObj}, ${adminId}, 'legacy', '{"k":2}'::jsonb, NULL)`);
    const base = `display_name, display_name_ar, provider, context_window, max_output_tokens`;
    await db.execute(orm.sql.raw(`INSERT INTO models (id, ${base}, category_scores) VALUES ('${ids.modelRepair}', 'a', 'a', 'p', 1, 1, to_jsonb('{"reasoning":91.5}'::text))`));
    await db.execute(orm.sql.raw(`INSERT INTO models (id, ${base}) VALUES ('${ids.modelDefault}', 'b', 'b', 'p', 1, 1)`));
    await db.execute(orm.sql.raw(`INSERT INTO models (id, ${base}, category_scores) VALUES ('${ids.modelArrayString}', 'c', 'c', 'p', 1, 1, to_jsonb('[1]'::text))`));

    expect(await kind("fraud_events", "details", ids.fraud)).toBe("string");
    expect(await kind("audit_logs", "before", ids.auditRepair)).toBe("string");
    expect(await kind("models", "category_scores", ids.modelRepair)).toBe("string");
    expect(await kind("models", "category_scores", ids.modelDefault)).toBe("object");
  });

  it("before the repair, reading through drizzle already returns the parsed value (the read path is unchanged)", async () => {
    const [a] = await db.select().from(schema.auditLogs).where(orm.eq(schema.auditLogs.id, ids.auditRepair));
    expect(a!.before).toEqual({ x: 1 });
    expect(a!.after).toEqual([1, 2]);
    const [m] = await db.select().from(schema.models).where(orm.eq(schema.models.id, ids.modelRepair));
    expect(m!.categoryScores).toEqual({ reasoning: 91.5 });
  });

  it("the migration turns the string rows into real objects/arrays and leaves everything else alone", async () => {
    await runMigration();
    expect(await kind("fraud_events", "details", ids.fraud)).toBe("object");
    expect(await kind("audit_logs", "before", ids.auditRepair)).toBe("object");
    expect(await kind("audit_logs", "after", ids.auditRepair)).toBe("array");
    expect(await kind("audit_logs", "before", ids.auditSpace)).toBe("object");     // leading whitespace
    expect(await kind("models", "category_scores", ids.modelRepair)).toBe("object");
    // untouched on purpose
    expect(await kind("audit_logs", "before", ids.auditKeep)).toBe("string");      // genuine JSON string
    expect(await kind("audit_logs", "after", ids.auditKeep)).toBe("string");       // starts with { but not JSON: skipped, no error
    expect(await kind("audit_logs", "before", ids.auditObj)).toBe("object");
    expect(await kind("audit_logs", "after", ids.auditObj)).toBeNull();
    expect(await kind("models", "category_scores", ids.modelArrayString)).toBe("string"); // a map column: arrays are not repaired
    expect(await kind("models", "category_scores", ids.modelDefault)).toBe("object");
    // JSON operators work now (they returned nothing before)
    const f = await rows<{ ip: string }>(orm.sql`SELECT details ->> 'ip' AS ip FROM fraud_events WHERE id = ${ids.fraud}`);
    expect(f[0]!.ip).toBe("1.2.3.4");
    const m = await rows<{ s: string }>(orm.sql`SELECT category_scores ->> 'reasoning' AS s FROM models WHERE id = ${ids.modelRepair}`);
    expect(m[0]!.s).toBe("91.5");
    // the content survived exactly
    const [a] = await db.select().from(schema.auditLogs).where(orm.eq(schema.auditLogs.id, ids.auditRepair));
    expect(a!.before).toEqual({ x: 1 });
    expect(a!.after).toEqual([1, 2]);
    const [keep] = await db.select().from(schema.auditLogs).where(orm.eq(schema.auditLogs.id, ids.auditKeep));
    expect(keep!.before).toBe("hello");
  });

  it("is re-runnable: a second run changes nothing", async () => {
    const snapshot = () => rows(orm.sql`SELECT 'f' t, id::text, details::text v FROM fraud_events
      UNION ALL SELECT 'ab', id::text, before::text FROM audit_logs UNION ALL SELECT 'aa', id::text, after::text FROM audit_logs
      UNION ALL SELECT 'm', id, category_scores::text FROM models ORDER BY 1, 2`);
    const first = await snapshot();
    await runMigration();
    expect(await snapshot()).toEqual(first);
  });

  it("new writes through drizzle are stored as real JSON (object, array, SQL NULL), and read back equal", async () => {
    const [a] = await db.insert(schema.auditLogs).values({ adminId, action: "new", before: { a: 1, nested: { b: [true] } }, after: [1, 2] }).returning();
    expect(await kind("audit_logs", "before", a!.id)).toBe("object");
    expect(await kind("audit_logs", "after", a!.id)).toBe("array");
    const [back] = await db.select().from(schema.auditLogs).where(orm.eq(schema.auditLogs.id, a!.id));
    expect(back!.before).toEqual({ a: 1, nested: { b: [true] } });
    const [n] = await db.insert(schema.auditLogs).values({ adminId, action: "nulls" }).returning();
    expect(await kind("audit_logs", "before", n!.id)).toBeNull();

    const [f] = await db.insert(schema.fraudEvents).values({ type: "SUSPICIOUS_PATTERN", severity: "high", details: { count: 5, ip: "9.9.9.9" } }).returning();
    expect(await kind("fraud_events", "details", f!.id)).toBe("object");
    const r = await rows<{ c: string }>(orm.sql`SELECT details ->> 'count' AS c FROM fraud_events WHERE id = ${f!.id}`);
    expect(r[0]!.c).toBe("5");

    const base = { displayName: "x", displayNameAr: "x", provider: "p", contextWindow: 1, maxOutputTokens: 1 };
    const withScores = `m-new-${randomUUID()}`;
    const withoutScores = `m-new-${randomUUID()}`;
    await db.insert(schema.models).values({ id: withScores, ...base, categoryScores: { coding: 80, reasoning: 71.5 } });
    await db.insert(schema.models).values({ id: withoutScores, ...base });
    expect(await kind("models", "category_scores", withScores)).toBe("object");
    expect(await kind("models", "category_scores", withoutScores)).toBe("object");
    const [m1] = await db.select().from(schema.models).where(orm.eq(schema.models.id, withScores));
    const [m2] = await db.select().from(schema.models).where(orm.eq(schema.models.id, withoutScores));
    expect(m1!.categoryScores).toEqual({ coding: 80, reasoning: 71.5 });
    expect(m2!.categoryScores).toEqual({});
  });
});
