/**
 * apps/web/features/chat/lib/idb-store.ts
 *
 * Phase 4d. A real `idb-keyval` adapter satisfying conversation-cache.ts's
 * `KVStore` interface, for callers that need live IndexedDB access
 * directly — currently use-conversations.ts, and the same shape
 * use-conversation-messages.ts will need once that hook lands.
 *
 * Kept in its own file rather than exported from conversation-cache.ts:
 * that file's header comment documents a deliberate choice to keep its
 * own real-idb-keyval adapter PRIVATE (`idbAdapter`/`getIdbAdapter`,
 * module-internal, used only by its own sign-out-clearer registration)
 * so nothing about that module's public surface ever requires a real
 * `indexedDB` global to import — `conversation-cache.test.ts` runs under
 * `environment: "node"` and imports that file directly. Re-exporting a
 * live adapter FROM that file would still be safe today (the adapter
 * itself only touches `idb-keyval` inside an async function body, never
 * at module-eval time), but would make that safety an invariant every
 * future edit to conversation-cache.ts has to preserve by hand. A
 * separate file makes it structural instead: nothing importing THIS
 * file can ever be surprised by what it pulls in.
 *
 * This does mean two small `idb-keyval` wrapper closures exist in the
 * codebase (this one, and conversation-cache.ts's private one) rather
 * than one shared instance. Harmless: `idb-keyval`'s `get`/`set`/`del`
 * are plain module-level functions over one shared default IndexedDB
 * store — two adapter objects calling them are two call sites, not two
 * stores. Flagged here rather than silently deduplicated, since
 * collapsing them would mean either exporting conversation-cache.ts's
 * private adapter (the exact coupling the paragraph above avoids) or
 * moving its sign-out-clearer registration to import from here instead,
 * and this phase's summary didn't ask for that restructuring — the
 * unclosed part is a five-minute follow-up either way it goes, worth
 * confirming rather than assuming.
 */
import type { KVStore } from "./conversation-cache";

let adapter: KVStore | undefined;

/** Lazily-created, memoized after the first call — same reasoning as
 *  conversation-cache.ts's own `getIdbAdapter`: avoid pulling in
 *  `idb-keyval` at module-eval time so nothing importing this file pays
 *  that cost (or needs a real `indexedDB` global) unless it actually
 *  calls this function. */
export function getRealIdbStore(): KVStore {
  if (!adapter) {
    adapter = {
      get: async (key) => (await import("idb-keyval")).get(key),
      set: async (key, value) => (await import("idb-keyval")).set(key, value),
      del: async (key) => (await import("idb-keyval")).del(key),
    };
  }
  return adapter;
}
