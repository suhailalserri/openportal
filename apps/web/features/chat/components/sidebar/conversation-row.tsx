"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, MoreHorizontal, Pin, PinOff, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConversationSummary } from "../../types";

export interface ConversationRowProps {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string, next: boolean) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

/**
 * apps/web/features/chat/components/sidebar/conversation-row.tsx
 *
 * Phase 4d. One sidebar entry. Two interaction modes:
 *  - NORMAL: a link-like button (navigates via `onSelect`, the parent
 *    owns actual routing — see conversation-sidebar.tsx) plus a
 *    `MoreHorizontal` menu (pin/unpin, rename, delete).
 *  - RENAMING: the title swaps for an `<Input>`, Enter/the check button
 *    commits via `onRename` (use-conversations.ts's optimistic rename,
 *    with rollback on failure already handled THERE — this component
 *    only fires the intent), Escape/the × button cancels without
 *    calling anything. An empty/whitespace title is not submitted
 *    (use-conversations.ts's own `rename()` already no-ops on that, this
 *    mirrors it so the input doesn't visibly "succeed" into a blank row
 *    for a frame before the hook's own guard is reached).
 *
 * DELETE is behind `AlertDialog` (a real confirmation, not the dropdown
 * item itself) — soft-delete is reversible server-side (B1's
 * `deletedAt`), but nothing in this UI exposes an undo, so a stray tap
 * on a touch device must not be one accidental tap away from a
 * conversation disappearing.
 *
 * `dir`-aware by construction: nothing here uses `left`/`right` margins
 * or `flex-row`-only assumptions — icons and menu positioning come from
 * Radix (already RTL-aware) and Tailwind's logical spacing utilities
 * (`ms-*`/`me-*`/`ps-*`/`pe-*`), per Rule 2.
 */
export function ConversationRow({
  conversation,
  isActive,
  onSelect,
  onTogglePin,
  onRename,
  onDelete,
  className,
}: ConversationRowProps) {
  const t = useTranslations("chat");
  const tCommon = useTranslations("common");
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const title = conversation.title?.trim() || t("newChat");

  const startRename = () => {
    setDraft(conversation.title ?? "");
    setIsRenaming(true);
  };

  const commitRename = () => {
    const trimmed = draft.trim();
    setIsRenaming(false);
    if (trimmed && trimmed !== conversation.title) onRename(conversation.id, trimmed);
  };

  React.useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  if (isRenaming) {
    return (
      <div className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5", className)}>
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setIsRenaming(false);
          }}
          onBlur={commitRename}
          className="h-8 text-[13px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t("renameConversation")}
          onMouseDown={(e) => {
            // Prevent the input's onBlur from firing (and committing via
            // an empty draft path) before this button's own click.
            e.preventDefault();
            commitRename();
          }}
        >
          <Check aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={tCommon("cancel")}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsRenaming(false);
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted",
        isActive && "bg-muted",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className="min-w-0 flex-1 truncate text-start text-[13px]"
        title={title}
      >
        {title}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            // Phase 4d Patch v7: was `opacity-0` unconditionally, only
            // reaching `opacity-100` via `:hover`/`:focus-visible` — on a
            // touch device (no hover, and focus-visible only follows
            // keyboard nav) that meant the trigger was invisible until a
            // tap accidentally landed on its hitbox and opened the menu
            // "by surprise," with no visible affordance beforehand. Rest
            // state is now a dim-but-visible `opacity-60`
            // (`text-faint-foreground` note: this is the SAME icon-only
            // ghost button used elsewhere at full opacity, so a lower
            // opacity here — not a different color token — is what keeps
            // it from competing with the row title while still being
            // discoverable); hover/focus/open still brighten it to fully
            // solid, and `[@media(hover:none)]:opacity-60` is the same
            // touch-target pattern already used for message actions
            // (message.tsx) — resolves to the same 60% on a device with
            // no hover, everywhere those two rules would otherwise
            // disagree.
            className="size-7 shrink-0 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-60"
            aria-label={t("moreOptions")}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onTogglePin(conversation.id, !conversation.isPinned)}>
            {conversation.isPinned ? (
              <PinOff aria-hidden="true" className="me-2 size-4" />
            ) : (
              <Pin aria-hidden="true" className="me-2 size-4" />
            )}
            {conversation.isPinned ? t("unpinConversation") : t("pinConversation")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={startRename}>{t("renameConversation")}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" className="me-2 size-4" />
            {t("deleteConversation")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConversation")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmBody", { title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(conversation.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteConversation")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
