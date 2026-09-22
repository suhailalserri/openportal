"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { ChatView } from "@/features/chat/components/chat-view";
import { ConversationSidebar } from "@/features/chat/components/sidebar/conversation-sidebar";
import { conversationPath } from "@/features/chat/lib/new-chat";

/**
 * apps/web/app/[locale]/(app)/chat/page.tsx
 *
 * Phase 4d. Replaces the Phase 2.1 placeholder (that file's own header
 * comment named this phase as its replacement). The empty `/chat` state:
 * sidebar + ChatView with `conversationId: undefined` — see
 * chat-view.tsx's header comment for why ONE component (not two
 * near-duplicates) covers both the empty state and an existing
 * conversation, and for the new-chat handoff `onNewChat`/`onSelect`
 * below participate in.
 *
 * "use client": the sidebar (`useConversations`) and `ChatView`
 * (`useChatStream`, `useSession`, etc.) are hooks-heavy client trees
 * with no meaningful server-rendered content of their own — this page
 * has no data to fetch server-side that the (app) layout's guard
 * doesn't already cover (Rule 4's server auth check already ran in
 * `AppLayout`), so there is no benefit to a server/client split here
 * the way `chat/[id]/page.tsx` briefly considered and rejected too (see
 * that file's own comment).
 *
 * FULL-HEIGHT, NOT `SectionPage`: every other page in `(app)` uses
 * `SectionPage` (`components/layout/section-page.tsx`) — a width-capped,
 * padded, titled frame appropriate for a form or a dashboard. Chat is
 * the first `(app)` page that needs to fill `<Main>` edge-to-edge (a
 * fixed-height sidebar + scrollable message area), so this renders its
 * own `flex h-full` row directly instead. `<Main>` (in `AppShell`,
 * `components/layout/main.tsx`) already gives this page `min-w-0
 * flex-1`; nothing here needs to duplicate that, only fill it
 * vertically too (`h-full` here relies on `<Main>`'s own parent being a
 * flex column with a bounded height, which `AppShell`'s `flex min-h-dvh`
 * root already provides).
 */
export default function ChatEmptyPage() {
  const router = useRouter();
  const locale = useLocale();

  const goToConversation = (id: string) => router.push(conversationPath(locale, id));

  return (
    <div className="flex h-full min-h-0">
      <ConversationSidebar
        activeConversationId={undefined}
        onSelect={goToConversation}
        onNewChat={() => router.push(`/${locale}/chat`)}
      />
      <ChatView conversationId={undefined} />
    </div>
  );
}
