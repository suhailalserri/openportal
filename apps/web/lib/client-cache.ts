"use client";

/**
 * apps/web/lib/client-cache.ts
 *
 * Rule 9 (FRONTEND_REBUILD_PLAN.md §3): "Clear per-user client caches on
 * sign-out (IndexedDB conversations, localStorage prefs) — shared-device
 * privacy."
 *
 * Registry pattern rather than a hardcoded list of keys: each feature
 * that adds a per-user, privacy-relevant client cache registers a
 * clearer here (see features/consent's registration), and
 * clearAllClientCaches() is the one thing sign-out calls. This avoids
 * account-menu.tsx (Phase 2.2, frozen zone? — no, components/layout is
 * NOT frozen, see FRONTEND_REBUILD_PLAN.md §4's frozen-zone list) having
 * to know about every feature's storage keys individually as more land
 * (Phase 4d's IndexedDB conversation cache is the next one expected).
 *
 * Deliberately NOT clearing theme/language preference (next-themes'
 * localStorage key, direction) — those are device preferences, not
 * per-user private data, and Rule 9's own examples ("conversations,
 * prefs") mean *account* prefs like a saved model choice, not the
 * device's light/dark setting a signed-out visitor should keep seeing.
 */
type ClientCacheClearer = () => void | Promise<void>;

const clearers = new Set<ClientCacheClearer>();

/** Called once per feature module, at import time, to register a cache
 * that must be wiped when the user signs out. */
export function registerClientCacheClearer(clearer: ClientCacheClearer): void {
  clearers.add(clearer);
}

/** Called from the sign-out flow (components/layout/account-menu.tsx)
 * before/alongside signOut(). Errors in one clearer never block another
 * (a shared device signing out should not fail loudly over a storage
 * quirk in one feature). */
export async function clearAllClientCaches(): Promise<void> {
  await Promise.allSettled([...clearers].map((clear) => clear()));
}
