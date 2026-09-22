"use client";

import { useParams } from "next/navigation";

import { ChatView } from "@/features/chat/components/chat-view";

/**
 * apps/web/app/[locale]/(app)/chat/[id]/page.tsx
 *
 * Phase 4d Patch v2. The counterpart to `../page.tsx` — an existing (or
 * just-created, see pending-first-message.ts) conversation. The inline
 * `ConversationSidebar` this page used to render is gone: the shell
 * (`AppShell` → `AppSidebar`/`MobileDrawer` → `SidebarNav`) now embeds
 * the conversation list on every route and derives
 * `activeConversationId` itself from the pathname, so this page no
 * longer needs to read `params.id` for the sidebar's sake — only
 * `ChatView` still needs it.
 *
 * Deliberately NOT a server component reading `params.id` and passing
 * it down as a prop: `id` also has to be read client-side by `ChatView`'s
 * own `useConversationMessages`/`useChatStream`/`useChatParams` calls
 * regardless (they're all client hooks), and `useParams()` here gives
 * the exact same value with no server/client boundary to thread it
 * across.
 *
 * `id` is untrusted route input the same way it always is (Rule 4) —
 * this page does not itself validate it. Every real read/write that
 * uses this id goes through `apps/web/app/api/**` routes, and each one
 * re-derives the owner from the signed-in session and filters
 * `WHERE id = ? AND userId = ?` itself — a mistyped or someone-else's id
 * in the URL bar simply 404s or returns another user's-empty-because-
 * filtered result at the API layer, never a client-trust boundary this
 * page would need to enforce itself.
 */
export default function ChatConversationPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;

  return (
    <div className="flex h-full min-h-0">
      <ChatView key={conversationId} conversationId={conversationId} />
    </div>
  );
}
