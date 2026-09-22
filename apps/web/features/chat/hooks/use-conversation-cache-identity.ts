"use client";

import * as React from "react";

import { useSession } from "@/lib/auth-client";
import { setActiveUserIdForCacheClearing } from "../lib/conversation-cache";

/**
 * apps/web/features/chat/hooks/use-conversation-cache-identity.ts
 *
 * Phase 4d. conversation-cache.ts's sign-out clearer needs to know WHICH
 * user's IndexedDB entries to remove, but that lib file is deliberately
 * framework-free (no `useSession`, no React) so its real logic stays
 * testable under `environment: "node"` with a plain fake store (see that
 * file's own header comment). This hook is the one bridge: it mirrors
 * the current session's user id into conversation-cache.ts's
 * module-level box on every session change, and clears the box on
 * sign-out (`session` becomes null) so a stray late write from a
 * just-signed-out user's own in-flight request can never target the
 * NEXT signed-in user's namespace by accident.
 *
 * Mounted once, high in the chat tree (chat-view.tsx and the empty-state
 * page both mount it — see those files) rather than in AppShell: nothing
 * about the account menu or the rest of the shell reads or writes this
 * cache, only features/chat does, so the identity mirror belongs beside
 * the feature that owns the cache, not the global shell (which already
 * owns the actual sign-out CALL via account-menu.tsx — this hook does
 * not duplicate that, it only keeps the clearer's target correct while
 * signed in).
 */
export function useConversationCacheIdentity(): void {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  React.useEffect(() => {
    setActiveUserIdForCacheClearing(userId);
    return () => setActiveUserIdForCacheClearing(undefined);
  }, [userId]);
}
