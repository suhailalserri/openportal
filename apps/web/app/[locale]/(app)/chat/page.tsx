"use client";

import { ChatView } from "@/features/chat/components/chat-view";

/**
 * apps/web/app/[locale]/(app)/chat/page.tsx
 *
 * Phase 4d Patch v2. The empty `/chat` state now renders only
 * `ChatView` — the conversation sidebar this page used to render inline
 * has moved to shell level (`components/layout/app-sidebar.tsx`'s
 * `SidebarNav`, driven by `AppShell`), so it appears exactly once,
 * consistently, on every route including this one, instead of being
 * duplicated per chat page. See `AppShell`'s and `AppSidebar`'s own
 * header comments for where `activeConversationId`/`onSelect`/
 * `onNewChat` now live.
 *
 * "use client": `ChatView` (`useChatStream`, `useSession`, etc.) is a
 * hooks-heavy client tree with no meaningful server-rendered content of
 * its own — this page has no data to fetch server-side that the (app)
 * layout's guard doesn't already cover (Rule 4's server auth check
 * already ran in `AppLayout`).
 *
 * FULL-HEIGHT, NOT `SectionPage`: every other page in `(app)` uses
 * `SectionPage` (`components/layout/section-page.tsx`) — a width-capped,
 * padded, titled frame appropriate for a form or a dashboard. Chat needs
 * to fill `<Main>` edge-to-edge instead, so this renders `ChatView`
 * directly; `<Main>` already gives it `min-w-0 flex-1`, and `h-full`
 * here relies on `<Main>`'s own parent being a flex column with a
 * bounded height, which `AppShell`'s `flex min-h-dvh` root provides.
 */
export default function ChatEmptyPage() {
  return (
    <div className="flex h-full min-h-0">
      <ChatView conversationId={undefined} />
    </div>
  );
}
