import { customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * A `jsonb` column that stores a real JSON ARRAY.
 *
 * Why this exists (P6.4, found by CI): with the pinned drizzle-orm 0.31.4 + postgres-js 3.4, the stock
 * `jsonb()` column stringifies the value and the driver stringifies it again, so Postgres receives a JSON
 * STRING that merely contains the array text. Reads still look right (drizzle parses a string back), which
 * hides the defect, but `jsonb_typeof` is `string`, JSON operators do not work, and the
 * `messages_content_blocks_is_array` CHECK (migration 0024) rejects the row.
 *
 * Fix: send the JSON as a `text` parameter and cast it in SQL (`$1::text::jsonb`), so the server parses it
 * exactly once. The `text` serializer is the identity, so this is correct whether or not the driver also
 * double-encodes JSON, and it keeps working if drizzle is upgraded.
 *
 * Reading accepts an already-parsed array (what postgres-js returns for jsonb) or a JSON string, and
 * returns anything that is not an array as null instead of throwing, so one bad row cannot break a page.
 *
 * Other `jsonb()` columns in this package (audit_logs.before/after, fraud_events.details,
 * models.category_scores) were NOT changed here; see docs/production/SESSION_LOG.md Session 55 (CI fix).
 */
export const jsonbArray = customType<{ data: unknown[]; driverData: unknown }>({
  dataType() {
    return "jsonb";
  },
  toDriver(value) {
    return sql`${JSON.stringify(value)}::text::jsonb`;
  },
  fromDriver(value) {
    let v: unknown = value;
    if (typeof v === "string") {
      try { v = JSON.parse(v); } catch { return null as unknown as unknown[]; }
    }
    return Array.isArray(v) ? v : (null as unknown as unknown[]);
  },
});
