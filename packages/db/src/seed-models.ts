/**
 * Seed the models table from MODEL_CATALOG.
 * Run AFTER schema migration: pnpm tsx src/seed-models.ts
 * Safe to re-run — uses onConflictDoUpdate to sync config → DB.
 */
import { sql } from "drizzle-orm";
import { db, models } from "./index";
import { MODEL_CATALOG } from "@ai-platform/config";

/** Coerce to a finite integer, or throw with the model id + field name so a
 *  bad MODEL_CATALOG entry is easy to find instead of surfacing as an
 *  opaque Postgres "[object Object]" error from a batch insert. */
function toInt(value: unknown, modelId: string, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(
      `MODEL_CATALOG["${modelId}"].${field} is not a valid number (got: ${JSON.stringify(value)}). ` +
      `Check packages/config/src/models.config.ts for this entry.`
    );
  }
  return Math.trunc(n);
}

async function seedModels() {
  console.log(`🤖 Seeding ${MODEL_CATALOG.length} models...`);

  const rows = MODEL_CATALOG.map((m) => ({
    id:               m.id,
    displayName:      m.displayName,
    displayNameAr:    m.displayNameAr,
    badge:            typeof m.badge === "string" ? m.badge : "",
    provider:         m.provider,
    tier:             m.tier,
    isAvailable:      m.isAvailable,
    markupMultiplier: String(m.markupMultiplier),
    contextWindow:    toInt(m.contextWindow,   m.id, "contextWindow"),
    maxOutputTokens:  toInt(m.maxOutputTokens, m.id, "maxOutputTokens"),
    supportsVision:   m.supportsVision ?? false,
  }));

  // Insert one at a time (not a single batch) so that if any row is still
  // bad for some other reason, the error names exactly which model id
  // failed instead of an unhelpful "$83" positional parameter.
  for (const row of rows) {
    try {
      await db
        .insert(models)
        .values(row)
        .onConflictDoUpdate({
          target: models.id,
          // NOTE: this previously referenced `models.displayName` etc. —
          // the TARGET table's own column — which is a no-op self-update
          // on conflict (row keeps its old value forever). Using
          // `sql`excluded...`` references the INCOMING row's new value
          // instead, so config changes actually sync on re-run, as the
          // comment above always intended.
          // isAvailable and markupMultiplier are deliberately left out of
          // this SET clause so admin overrides in the DB survive re-seeds.
          set: {
            displayName:     sql`excluded.display_name`,
            displayNameAr:   sql`excluded.display_name_ar`,
            badge:           sql`excluded.badge`,
            provider:        sql`excluded.provider`,
            tier:            sql`excluded.tier`,
            contextWindow:   sql`excluded.context_window`,
            maxOutputTokens: sql`excluded.max_output_tokens`,
            supportsVision:  sql`excluded.supports_vision`,
            updatedAt:       new Date(),
          },
        });
    } catch (err) {
      console.error(`❌ Failed seeding model "${row.id}":`, err);
      throw err;
    }
  }

  console.log("✅ Models seeded:");
  rows.forEach((r) => console.log(`   ${r.isAvailable ? "✓" : "✗"} ${r.id}`));
  console.log(
    "\nℹ️  isAvailable and markupMultiplier are preserved if already set by admin."
  );
  process.exit(0);
}

seedModels().catch((err) => { console.error(err); process.exit(1); });
