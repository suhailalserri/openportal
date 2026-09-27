"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 20;

/**
 * apps/web/features/admin/users/hooks/use-user-conversations.ts
 *
 * Wraps `admin.listUserConversations` with `useInfiniteQuery` — same
 * keyset-cursor convention as `features/admin/logs/hooks/use-admin-
 * logs.ts`'s `useAdminLogs` (`cursor`/`limit` in, `nextCursor` out).
 * Read-only: this list is the entry point into a specific user's chat
 * history from their admin detail page (see ../conversations-panel.tsx),
 * so an admin can verify credit usage against actual conversation
 * content rather than trusting the transaction ledger alone.
 */
export function useUserConversations(userId: string) {
  const query = trpc.admin.listUserConversations.useInfiniteQuery(
    { userId, limit: PAGE_SIZE },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    isEmpty: !query.isLoading && !query.isError && items.length === 0,
    hasMore: Boolean(query.hasNextPage),
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}
