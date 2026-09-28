"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { useUserConversations } from "../hooks/use-user-conversations";
import { ConversationViewer } from "./conversation-viewer";

interface Props {
  userId: string;
}

/**
 * apps/web/features/admin/users/components/conversations-panel.tsx
 *
 * Read-only list of a user's conversations, rendered as its own card on
 * the user detail page (see ../detail.tsx). Clicking a row opens
 * <ConversationViewer>, which fetches and shows that conversation's full
 * message history plus the credit cost billed for each reply — the
 * actual point of this feature: letting an admin check a suspicious or
 * disputed usage debit against what was really sent/received, not just
 * the ledger's number.
 *
 * Nothing here can send a message, edit a conversation, or act as the
 * user in any way — every procedure this and the viewer call is a plain
 * query (see admin-conversations.service.ts's header comment).
 */
export function ConversationsPanel({ userId }: Props) {
  const t = useTranslations("admin.usersPage.detail.conversations");
  const locale = useLocale() as "ar" | "en";
  const { items, isLoading, isError, isEmpty, hasMore, isFetchingMore, loadMore, refetch } =
    useUserConversations(userId);

  const [openConversationId, setOpenConversationId] = useState<string | undefined>(undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <p>{t("loadError")}</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.updated")}</TableHead>
                  <TableHead>{t("columns.title")}</TableHead>
                  <TableHead>{t("columns.model")}</TableHead>
                  <TableHead className="text-end">{t("columns.messages")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isEmpty ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setOpenConversationId(c.id)}
                    >
                      <TableCell>{formatDate(c.updatedAt, locale)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {c.title || t("untitled")}
                        {c.deletedAt ? (
                          <Badge variant="secondary" className="ms-2">
                            {t("deleted")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.modelId ?? "—"}</TableCell>
                      <TableCell className="text-end">{c.messageCount}</TableCell>
                      <TableCell className="text-end">
                        <Button variant="ghost" size="sm" onClick={() => setOpenConversationId(c.id)}>
                          {t("view")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {hasMore && (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={isFetchingMore}>
                  {isFetchingMore ? t("loadingMore") : t("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>

      <ConversationViewer
        userId={userId}
        conversationId={openConversationId}
        open={openConversationId !== undefined}
        onOpenChange={(open) => {
          if (!open) setOpenConversationId(undefined);
        }}
      />
    </Card>
  );
}
