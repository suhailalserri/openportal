"use client";

import { useSyncExternalStore } from "react";

/**
 * Tailwind's `md` breakpoint is 768px; "mobile" is everything below it.
 * Kept as a constant so the JS check and the `md:` utilities in the shell
 * can't quietly disagree.
 */
export const MOBILE_MEDIA_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

// The server can't know the viewport. `false` matches the desktop markup
// the server renders; on a phone React re-renders with `true` right after
// hydration (useSyncExternalStore handles that without a mismatch error).
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Rule 3 (FRONTEND_REBUILD_PLAN.md §3): context-dependent Radix pieces are
 * rendered from this value — `{isMobile && <MobileDrawer />}` — never
 * kept in the tree and hidden with `hidden md:block`.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
