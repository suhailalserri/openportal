"use client";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/users/hooks/use-conversation-messages.ts
 *
 * Wraps `admin.getConversationMessages` (userId + conversationId) — the
 * read-only per-message view opened from a row in <ConversationsPanel>.
 * `enabled: false` until a conversationId is actually picked, since this
 * is rendered inside a dialog that mounts before the admin has selected
 * anything (same lazy-enable pattern as other admin drill-down dialogs
 * in this codebase, e.g. the model form dialog only prefilling once a
 * row is passed in).
 */
export function useConversationMessages(userId: string, conversationId: string | undefined) {
  const query = trpc.admin.getConversationMessages.useQuery(
    { userId, conversationId: conversationId ?? "" },
    { enabled: Boolean(conversationId) },
  );

  return {
    conversation: query.data?.conversation,
    messages: query.data?.messages ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message,
    refetch: () => void query.refetch(),
  };
}
