/**
 * Under `exactOptionalPropertyTypes: true`, an object typed with an
 * optional property (e.g. from a Zod `.optional()` field) carries the
 * literal type `foo?: string | undefined`. That is NOT the same as
 * Drizzle's generated insert/update value types, which model "optional"
 * as "key may be omitted" without an explicit `| undefined` in the
 * value position. Passing `{ foo: undefined }` (even via a spread) is a
 * type error against those targets — see the deploy log in
 * PAYMENT_METHODS_PLAN.md's "known gaps" for the concrete failures.
 *
 * This helper removes keys whose value is `undefined` at runtime and,
 * via the return type, narrows each property's type by excluding
 * `undefined` from it — while keeping the key itself present in the
 * type. A "required key of type `T`" is always assignable to a target's
 * "optional key of type `T | ...`", which is exactly what Drizzle's
 * insert/update setters expect. Keys that are actually missing at
 * runtime are simply not iterated, so this is safe to pass straight
 * into `.values()` / `.set()`.
 */
export function stripUndefined<T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result = {} as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as { [K in keyof T]: Exclude<T[K], undefined> };
}
