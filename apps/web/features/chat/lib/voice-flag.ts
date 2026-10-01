import type { StorageLike } from "./chat-params-storage";

/**
 * apps/web/features/chat/lib/voice-flag.ts
 *
 * P6.3b. Per-browser switch for voice input; same reasoning and guarding as stream-mode.ts (no feature
 * flag mechanism in web, an env var needs a Vercel rebuild, and voice input BILLS money, so its first
 * release is opt-in). Turn on in the console:
 *     localStorage.setItem("aip.flag.voice", "1")      // on
 *     localStorage.removeItem("aip.flag.voice")         // off (default)
 * Outside the sign-out-cleared `aip.chat.` prefix on purpose (device switch, no account data).
 * Any storage failure reads as off.
 */
export const VOICE_FLAG_KEY = "aip.flag.voice";

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readVoiceEnabled(storage: StorageLike | undefined = getStorage()): boolean {
  try {
    return storage?.getItem(VOICE_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeVoiceEnabled(enabled: boolean, storage: StorageLike | undefined = getStorage()): void {
  try {
    if (!storage) return;
    if (enabled) storage.setItem(VOICE_FLAG_KEY, "1");
    else storage.removeItem(VOICE_FLAG_KEY);
  } catch {
    // The flag just stays as it was.
  }
}
