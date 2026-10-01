import type { StorageLike } from "./chat-params-storage";

/**
 * apps/web/features/chat/lib/stream-mode.ts
 *
 * P6.3a. The one switch between the old plain-text chat stream (default, for
 * everyone) and the structured v2 stream (thinking block, status line).
 *
 * WHY A BROWSER-STORAGE FLAG: the web app has no feature-flag mechanism, and an
 * env var would need a Vercel rebuild to flip. A per-browser key lets the owner
 * try v2 on one device, on the real deployment, and turn it off again with no
 * deploy. To turn it on, in the browser console on the app:
 *     localStorage.setItem("aip.flag.streamV2", "1")     // on
 *     localStorage.removeItem("aip.flag.streamV2")        // off (default)
 *
 * The key is deliberately NOT under `aip.chat.` (chat-params-storage.ts): that
 * prefix is wiped on sign-out because it holds per-account data (Rule 9). This
 * is a per-device developer switch with no account data in it, and wiping it
 * on every sign-out would make testing tedious.
 *
 * Guarded like chat-params-storage.ts: storage can throw (Safari private mode,
 * disabled storage) or be absent (SSR). Any failure means "off", i.e. the old
 * stream; it must never break sending a message.
 */

export const STREAM_V2_FLAG_KEY = "aip.flag.streamV2";

/** The exact media type the api negotiates on (apps/api services/stream-v2.ts). */
export const STREAM_V2_MEDIA_TYPE = "application/vnd.aip.stream+v2";

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** True only for the exact value "1"; anything else (missing, "0", "true", garbage) is off. */
export function readStreamV2Enabled(storage: StorageLike | undefined = getStorage()): boolean {
  try {
    return storage?.getItem(STREAM_V2_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeStreamV2Enabled(
  enabled: boolean,
  storage: StorageLike | undefined = getStorage(),
): void {
  try {
    if (!storage) return;
    if (enabled) storage.setItem(STREAM_V2_FLAG_KEY, "1");
    else storage.removeItem(STREAM_V2_FLAG_KEY);
  } catch {
    // Nothing useful to do; the flag just stays as it was.
  }
}
