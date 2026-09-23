"use client";

import { useEffect } from "react";
import { applyThemePreset, readThemePreset } from "@/lib/theme-preset";

/**
 * apps/web/providers/theme-preset-sync.tsx (Phase 7.2)
 *
 * Renders nothing. On mount, overwrites the server-rendered static
 * `data-theme-preset="gateway"` (app/[locale]/layout.tsx) with whatever
 * the visitor last chose in Settings → Preferences.
 *
 * Effect, not render-time: localStorage is unavailable during SSR, so
 * reading it during the first render would produce a hydration
 * mismatch — same reasoning as `use-chat-models.ts`'s `readLastModel()`
 * call and `theme-toggle.tsx`'s `mounted` guard. With only one preset
 * shipped today this never visibly flips anything; it starts mattering
 * the day a second preset exists.
 */
export function ThemePresetSync() {
  useEffect(() => {
    applyThemePreset(readThemePreset());
  }, []);
  return null;
}
