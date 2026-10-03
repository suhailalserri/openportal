import { customType } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";

/**
 * The one place that knows how to send JSON to a `jsonb` column correctly.
 *
 * Why (found by CI in P6.4): with the pinned drizzle-orm 0.31.4 + postgres-js 3.4 the stock `jsonb()`
 * column stringifies the value and the driver stringifies it again, so Postgres receives a JSON STRING
 * that merely contains the object text. Reads still look right (drizzle parses a string back), which hid
 * the defect: `jsonb_typeof` was `string`, JSON operators (`details ->> 'x'`) returned nothing.
 *
 * Fix: send the JSON as a `text` parameter and cast it in SQL (`$1::text::jsonb`) so the server parses it
 * exactly once. The `text` serializer is the identity, so this is correct whether or not the driver also
 * double-encodes, and it keeps working if drizzle is upgraded.
 */
export function jsonbParam(value: unknown): SQL {
  return sql`${JSON.stringify(value)}::text::jsonb`;
}

/**
 * Turns what the driver hands back for a jsonb value into the JS value. Written to be right whichever way
 * the driver delivers jsonb (this was not verifiable when it was written): already parsed (an object,
 * array, number...), or as JSON text.
 *  - a string is parsed when it is valid JSON, otherwise returned as is (a plain string value);
 *  - if the result is STILL a string that looks like an object or array, it was stored double-encoded
 *    (the old rows) and the driver gave us the outer layer as text: parse once more.
 */
export function decodeJsonb(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let v: unknown;
  try { v = JSON.parse(value); } catch { return value; }
  if (typeof v === "string" && /^\s*[[{]/.test(v)) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

/**
 * A `jsonb` column holding any JSON value (object, array, ...), typed as `T`.
 * Used by audit_logs.before/after, fraud_events.details and models.category_scores (migration 0025
 * repairs their old rows). Messages use the stricter `jsonbArray`.
 *
 * Reading accepts everything the stock column accepted, so nothing that reads these columns changes, and a
 * row gives the same value before and after migration 0025. See `decodeJsonb`.
 */
export function jsonbValue<T = unknown>(name: string) {
  return customType<{ data: T; driverData: unknown }>({
    dataType() {
      return "jsonb";
    },
    toDriver(value) {
      return jsonbParam(value);
    },
    fromDriver(value) {
      return decodeJsonb(value) as T;
    },
  })(name);
}
