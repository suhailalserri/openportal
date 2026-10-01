import { db, platformConfig, PLATFORM_CONFIG_ID } from "@ai-platform/db";
import { eq } from "drizzle-orm";

/**
 * apps/api/src/services/feature-flags.service.ts
 *
 * P6.3d. Admin-controlled feature switches (columns on the platform_config singleton, migration
 * 0023). One switch per P6.3 feature; each defaults to OFF and, once an admin turns it on, applies
 * to every user. The switches only decide whether the web SHOWS the feature: the backend endpoints
 * keep their own checks (storage configured, a speech model published, balance, rate limits).
 */
export interface FeatureFlags {
  attachments: boolean;
  voice: boolean;
  /** Structured stream (protocol v2): thinking blocks and the status line. */
  thinking: boolean;
}

export const FEATURES_OFF: FeatureFlags = { attachments: false, voice: false, thinking: false };

interface FeatureRow {
  featureAttachments?: boolean | null | undefined;
  featureVoice?: boolean | null | undefined;
  featureThinking?: boolean | null | undefined;
}

/** Row (or no row) -> flags. Only a literal `true` turns a feature on, so a missing row or column is OFF. */
export function toFeatureFlags(row: FeatureRow | null | undefined): FeatureFlags {
  return {
    attachments: row?.featureAttachments === true,
    voice: row?.featureVoice === true,
    thinking: row?.featureThinking === true,
  };
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const row = await db.query.platformConfig.findFirst({ where: eq(platformConfig.id, PLATFORM_CONFIG_ID) });
  return toFeatureFlags(row);
}

/** Writes all three switches (the admin page always sends the full set). Returns before/after for the audit log. */
export async function updateFeatureFlags(
  next: FeatureFlags,
  adminId: string,
): Promise<{ before: FeatureFlags; after: FeatureFlags }> {
  const before = await getFeatureFlags();
  const values = {
    featureAttachments: next.attachments,
    featureVoice: next.voice,
    featureThinking: next.thinking,
  };
  await db
    .insert(platformConfig)
    .values({ id: PLATFORM_CONFIG_ID, ...values, updatedByAdminId: adminId })
    .onConflictDoUpdate({
      target: platformConfig.id,
      set: { ...values, updatedAt: new Date(), updatedByAdminId: adminId },
    });
  return { before, after: next };
}
