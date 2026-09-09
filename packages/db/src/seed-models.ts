/**
 * Seed the models table from MODEL_CATALOG.
 * Run AFTER schema migration: pnpm tsx src/seed-models.ts
 * Safe to re-run — uses onConflictDoUpdate to sync config → DB.
 */
import { db, models } from "./index";
import { MODEL_CATALOG } from "@ai-platform/config";

async function seedModels() {
  console.log(`🤖 Seeding ${MODEL_CATALOG.length} models...`);

  const rows = MODEL_CATALOG.map((m) => ({
    id:               m.id,
    displayName:      m.displayName,
    displayNameAr:    m.displayNameAr,
    badge:            m.badge ?? "",
    provider:         m.provider,
    tier:             m.tier,
    isAvailable:      m.isAvailable,
    markupMultiplier: String(m.markupMultiplier),
    contextWindow:    m.contextWindow,
    maxOutputTokens:  m.maxOutputTokens,
    supportsVision:   m.supportsVision ?? false,
  }));

  await db
    .insert(models)
    .values(rows)
    .onConflictDoUpdate({
      target: models.id,
      // Sync static config values but preserve admin-overridden fields
      // (isAvailable, markupMultiplier) by not updating them here.
      set: {
        displayName:     models.displayName,
        displayNameAr:   models.displayNameAr,
        badge:           models.badge,
        provider:        models.provider,
        tier:            models.tier,
        contextWindow:   models.contextWindow,
        maxOutputTokens: models.maxOutputTokens,
        supportsVision:  models.supportsVision,
        updatedAt:       new Date(),
      },
    });

  console.log("✅ Models seeded:");
  rows.forEach((r) => console.log(`   ${r.isAvailable ? "✓" : "✗"} ${r.id}`));
  console.log(
    "\nℹ️  isAvailable and markupMultiplier are preserved if already set by admin."
  );
  process.exit(0);
}

seedModels().catch((err) => { console.error(err); process.exit(1); });
