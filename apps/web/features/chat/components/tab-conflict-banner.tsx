"use client";

import { useTranslations } from "next-intl";

import { useTabConflict } from "../hooks/use-tab-conflict";

export interface TabConflictBannerProps {
  conversationId: string | null | undefined;
  isSending: boolean;
}

/**
 * apps/web/features/chat/components/tab-conflict-banner.tsx
 *
 * Phase 4b. `chat.tabConflict` (another tab has this conversation open)
 * vs `chat.tabConflictSending` (that other tab is actively streaming) —
 * both already exist in messages/{ar,en}.json. Advisory only, per
 * use-tab-conflict.ts's own header comment — this does not disable
 * Send in the other tab, it only informs.
 */
export function TabConflictBanner({ conversationId, isSending }: TabConflictBannerProps) {
  const t = useTranslations("chat");
  const { otherTabOpen, otherTabSending } = useTabConflict(conversationId, isSending);

  if (!otherTabOpen) return null;

  return (
    <div
      role="status"
      className="rounded-[10px] border border-border bg-muted px-3 py-2 text-[13px] text-muted-foreground"
    >
      {otherTabSending ? t("tabConflictSending") : t("tabConflict")}
    </div>
  );
}
