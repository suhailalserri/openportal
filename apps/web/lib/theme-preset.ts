/**
 * apps/web/lib/theme-preset.ts (Phase 7.2)
 *
 * `app/[locale]/layout.tsx` currently hardcodes `data-theme-preset="gateway"`
 * with a comment saying "A preset switcher is Phase 7.2's job — this
 * attribute is what it will start toggling." This is that switcher's
 * storage + apply logic.
 *
 * `AVAILABLE_PRESETS` is read from what actually exists in
 * `styles/theme-presets.css` (currently one: "gateway"), not the "3
 * presets" D2/§3 imply — flagged in the 7.2 phase summary. The
 * Preferences UI renders whatever this list contains, so it lights up
 * automatically the day a second/third preset's CSS block lands; no
 * further wiring needed here.
 *
 * A preset is a device preference, not per-account private data — same
 * reasoning as light/dark theme and language in lib/client-cache.ts's
 * header comment ("Deliberately NOT clearing theme/language preference
 * ... device preferences, not per-user private data"). So this is
 * intentionally NOT registered with registerClientCacheClearer/Rule 9.
 */

export const AVAILABLE_PRESETS = ["gateway"] as const;
export type ThemePreset = (typeof AVAILABLE_PRESETS)[number];

const STORAGE_KEY = "aip.themePreset";
const DEFAULT_PRESET: ThemePreset = "gateway";

function isValidPreset(v: string | null): v is ThemePreset {
  return v !== null && (AVAILABLE_PRESETS as readonly string[]).includes(v);
}

/** Reads the stored preset, falling back to the default if unset/invalid/blocked. */
export function readThemePreset(): ThemePreset {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    return isValidPreset(v) ? v : DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

/** Persists the choice AND applies it live to <html data-theme-preset>, so a
 *  switch takes effect immediately without a reload. */
export function writeThemePreset(preset: ThemePreset): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // Quota/private-mode: losing the remembered choice is harmless, but
    // still apply it live below for this tab.
  }
  applyThemePreset(preset);
}

export function applyThemePreset(preset: ThemePreset): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.themePreset = preset;
}
