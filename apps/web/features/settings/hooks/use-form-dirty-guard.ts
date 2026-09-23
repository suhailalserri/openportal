"use client";

import { useEffect } from "react";

/**
 * apps/web/features/settings/hooks/use-form-dirty-guard.ts (Phase 7.1)
 *
 * Own implementation (New API's `use-form-dirty-guard`/
 * `form-navigation-guard` are structure-reference only, AGPL — see
 * Appendix E). Scoped deliberately narrow: a native `beforeunload`
 * listener while `isDirty` is true, which covers a full page
 * reload/tab-close/external navigation. It does NOT intercept Next.js
 * client-side route transitions (e.g. clicking the sidebar to another
 * settings section or a different page) — `next/navigation` has no
 * public "confirm before route change" hook in the App Router the way
 * pages-router `beforeRouteChange` did, and building a client-side
 * router-transition interceptor is enough extra surface (would need to
 * wrap every `<Link>`/`router.push` call site) that it's left out of
 * this session rather than half-built. Flagged as the one open gap in
 * the phase summary's point 4/"not verified".
 *
 * Switching between Tabs/Accordion sections in `index.tsx` does NOT
 * unmount the other sections' forms (Radix Tabs/Accordion keep inactive
 * content in the DOM by default unless `forceMount`/unmount props say
 * otherwise), so in-progress edits in one section survive switching to
 * look at another — this guard's `beforeunload` scope is really only
 * about leaving the page entirely.
 */
export function useFormDirtyGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
