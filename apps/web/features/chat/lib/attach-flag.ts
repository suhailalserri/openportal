import type { StorageLike } from "./chat-params-storage";

/**
 * apps/web/features/chat/lib/attach-flag.ts
 *
 * P6.3c. Per-browser switch for attachments (same reasoning and guarding as stream-mode.ts and
 * voice-flag.ts: no flag mechanism in web, an env var needs a rebuild, and this touches uploads and
 * storage quota, so the first release is opt-in).
 *     localStorage.setItem("aip.flag.attach", "1")     // on
 *     localStorage.removeItem("aip.flag.attach")        // off (default)
 */
export const ATTACH_FLAG_KEY = "aip.flag.attach";

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readAttachEnabled(storage: StorageLike | undefined = getStorage()): boolean {
  try {
    return storage?.getItem(ATTACH_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAttachEnabled(enabled: boolean, storage: StorageLike | undefined = getStorage()): void {
  try {
    if (!storage) return;
    if (enabled) storage.setItem(ATTACH_FLAG_KEY, "1");
    else storage.removeItem(ATTACH_FLAG_KEY);
  } catch {
    // The flag just stays as it was.
  }
}
