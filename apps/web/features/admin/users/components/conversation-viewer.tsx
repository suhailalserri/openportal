"use client";

import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCredits, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConversationMessages } from "../hooks/use-conversation-messages";

interface Props {
  userId: string;
  conversationId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * apps/web/features/admin/users/components/conversation-viewer.tsx
 *
 * Read-only — every message is rendered as plain text, there is no
 * input, no reply box, no edit/delete affordance. This exists so an
 * admin can check the credit ledger against real conversation content:
 * each assistant reply shows the `creditCost` billed for it (from the
 * matching `usage_debit` transaction, joined server-side by
 * `requestId` — see admin-conversations.service.ts). A reply with no
 * matching transaction shows "—" rather than 0, since that gap (a
 * partial/failed stream, or a genuine billing miss) is exactly the kind
 * of thing this screen exists to surface, not hide.
 *
 * Opening this sheet is itself audit-logged server-side
 * (admin.getConversationMessages) — reading a user's private chat
 * content is sensitive enough to leave a trail every time, not just
 * gate on role.
 */
export function ConversationViewer({ userId, conversationId, open, onOpenChange }: Props) {
  const t = useTranslations("admin.usersPage.detail.conversations");
  const locale = useLocale() as "ar" | "en";
  const { conversation, messages, isLoading, isError, errorMessage, refetch } =
    useConversationMessages(userId, conversationId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{conversation?.title || t("untitled")}</SheetTitle>
          <SheetDescription>
            {conversation ? (
              <>
                {conversation.modelId ?? "—"} · {t("messagesCount", { count: conversation.messageCount })}
                {conversation.deletedAt ? (
                  <Badge variant="secondary" className="ms-2">
                    {t("deleted")}
                  </Badge>
                ) : null}
              </>
            ) : (
              t("viewerDescription")
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-16 w-3/4 self-end" />
              <Skeleton className="h-24 w-3/4" />
            </>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
              <p>{errorMessage || t("loadError")}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                {t("retry")}
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noMessages")}</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex max-w-[85%] flex-col gap-1 rounded-lg border px-3 py-2 text-sm",
                  m.role === "user" ? "self-end bg-secondary" : "self-start bg-card",
                  m.role === "system" && "self-center bg-muted text-muted-foreground",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="font-medium uppercase">{t(`role.${m.role}` as "role.user")}</span>
                  <span>{formatDate(m.createdAt, locale)}</span>
                  {m.isPartial ? <Badge variant="secondary">{t("partial")}</Badge> : null}
                  {m.feedback ? <Badge variant="outline">{t(`feedback.${m.feedback}` as "feedback.positive")}</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                {m.role === "assistant" ? (
                  <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                    {m.inputTokens !== null || m.outputTokens !== null ? (
                      <span>
                        {t("tokens", { input: m.inputTokens ?? 0, output: m.outputTokens ?? 0 })}
                      </span>
                    ) : null}
                    <span>
                      {t("cost")}{" "}
                      <span className="font-medium text-foreground">
                        {m.creditCost !== null ? formatCredits(m.creditCost, locale) : "—"}
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
