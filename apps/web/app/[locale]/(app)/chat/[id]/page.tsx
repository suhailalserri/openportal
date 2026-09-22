"use client";

import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { ChatView } from "@/features/chat/components/chat-view";
import { ConversationSidebar } from "@/features/chat/components/sidebar/conversation-sidebar";
import { conversationPath } from "@/features/chat/lib/new-chat";

/**
 * apps/web/app/[locale]/(app)/chat/[id]/page.tsx
 *
 * Phase 4d. The counterpart to `../page.tsx` — an existing (or
 * just-created, see pending-first-message.ts) conversation. Deliberately
 * NOT a server component reading `params.id` and passing it down as a
 * prop: `id` also has to be read client-side by `ChatView`'s own
 * `useConversationMessages`/`useChatStream`/`useChatParams` calls
 * regardless (they're all client hooks), and `useParams()` here gives
 * the exact same value with no server/client boundary to thread it
 * across — a server wrapper would add a file and a prop for no
 * behavioural difference, the same reasoning `../page.tsx`'s own header
 * comment gives for staying a client component.
 *
 * `id` is untrusted route input the same way it always is (Rule 4) —
 * this page does not itself validate it. It doesn't need to: nothing
 * here queries the database directly. Every real read/write that uses
 * this id (`useConversationMessages`'s GET, `useChatStream`'s POST,
 * `useChatParams`'s GET/PATCH) goes through `apps/web/app/api/**`
 * routes, and EVERY one of those routes re-derives the owner from the
 * signed-in session and filters `WHERE id = ? AND userId = ?` itself
 * (confirmed by reading `app/api/conversations/[id]/route.ts`, frozen/
 * read-only, in this phase's own audit) — a mistyped or someone-else's
 * id in the URL bar simply 404s or returns another user's-empty-because-
 * filtered result at the API layer, never a client-trust boundary this
 * page would need to enforce itself.
 *
 * SAME SIDEBAR INSTANCE SHAPE AS THE EMPTY PAGE: `activeConversationId`
 * is now this route's own `id` (so `ConversationRow` can highlight it),
 * and `onNewChat` navigates to the empty `/chat` route rather than
 * clearing local state in place — there is no shared layout between the
 * two pages that could hold sidebar state across the navigation instead
 * (see `../page.tsx`'s "full-height, not SectionPage" note: both pages
 * independently render their own `ConversationSidebar`, each backed by
 * the same `useConversations` hook, which is itself IndexedDB/network-
 * backed and therefore consistent across the remount, not component
 * state that would otherwise be lost).
 */
export default function ChatConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();

  const conversationId = params.id;

  const goToConversation = (id: string) => router.push(conversationPath(locale, id));

  return (
    <div className="flex h-full min-h-0">
      <ConversationSidebar
        activeConversationId={conversationId}
        onSelect={goToConversation}
        onNewChat={() => router.push(`/${locale}/chat`)}
      />
      <ChatView key={conversationId} conversationId={conversationId} />
    </div>
  );
}
