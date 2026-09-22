/**
 * apps/web/features/chat/lib/composer-panels.ts
 *
 * Phase 4c (rework). Which inline composer panel is open. At most one at a
 * time: opening the model list closes the parameters and vice versa, and
 * tapping the open one's button closes it. Pure so the rule is unit-tested
 * (vitest here has no DOM).
 */
export type ComposerPanelId = "model" | "params";
export type OpenPanel = ComposerPanelId | null;

export function togglePanel(current: OpenPanel, target: ComposerPanelId): OpenPanel {
  return current === target ? null : target;
}

/** Panels can't stay open while their trigger is unavailable. */
export function reconcilePanel(
  current: OpenPanel,
  available: { model: boolean; params: boolean },
): OpenPanel {
  if (current === "model" && !available.model) return null;
  if (current === "params" && !available.params) return null;
  return current;
}
