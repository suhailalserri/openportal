/** P6.3d. Pure helpers for the admin feature switches (kept apart from the hook so they are unit-testable). */
export type FeatureKey = "attachments" | "voice" | "thinking";
export type FeatureDraft = Record<FeatureKey, boolean>;

/** True when the draft differs from what the server has (so Save has something to do). */
export function isFeatureDraftDirty(server: FeatureDraft, draft: FeatureDraft): boolean {
  return server.attachments !== draft.attachments || server.voice !== draft.voice || server.thinking !== draft.thinking;
}
