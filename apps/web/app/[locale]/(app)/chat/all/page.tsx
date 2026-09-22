"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ConversationFullList } from "@/features/chat/components/sidebar/conversation-full-list";
import { conversationPath } from "@/features/chat/lib/new-chat";

/**
 * apps/web/app/[locale]/(app)/chat/all/page.tsx
 *
 * Phase 4d Patch v2. The dedicated "all conversations" page reached from
 * the sidebar/drawer's "View all chats →" link once the embedded list
 * is capped (see conversation-sidebar.tsx's `limit` prop). Full search +
 * full date-grouped list via `ConversationFullList`, plus a round
 * floating action button that starts a new chat — the pattern from the
 * reference redesign screenshot, restyled to this app's own primary
 * color rather than copying the screenshot's palette.
 *
 * "use client": no server data this page needs beyond what the (app)
 * layout's guard already fetched, and `ConversationFullList` is
 * hooks-heavy (`useConversations`) regardless.
 *
 * FAB positioning: `end-4 bottom-4`, never `right-4` — Rule 2's lint ban
 * (lib/eslint-rules.test.ts) fails the build on a literal `right-`/
 * `left-` class, and `end-` is also just correct here: the button must
 * sit at the trailing edge in both directions (left in `ar`, right in
 * `en`), not always the physical right.
 */
export default function ChatAllPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("chat");

  const goToConversation = (id: string) => router.push(conversationPath(locale, id));
  const startNewChat = () => router.push(`/${locale}/chat`);

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold">{t("allChatsTitle")}</h1>

      <ConversationFullList activeConversationId={undefined} onSelect={goToConversation} />

      <Button
        type="button"
        onClick={startNewChat}
        size="icon"
        aria-label={t("newChat")}
        className="fixed end-4 bottom-4 size-14 rounded-full shadow-lg md:end-6 md:bottom-6"
      >
        <Plus aria-hidden="true" className="size-6" />
      </Button>
    </div>
  );
}
