"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { Copy, Check, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCredits, formatRelativeDate } from "@/lib/format";
import { SafeMarkdown } from "@/components/markdown/safe-markdown";
import { MessageActions } from "./message-actions";
import { ThinkingBlock } from "./thinking-block";
import { FileGlyph } from "../composer/file-glyph";
import type { ChatMessage } from "../../types";

export interface MessageProps {
  message: ChatMessage;
  onCopy?: ((message: ChatMessage) => void) | undefined;
  onRegenerate?: ((message: ChatMessage) => void) | undefined;
  onFeedback?: ((message: ChatMessage, value: "positive" | "negative") => void) | undefined;
  /** Edit affordance on a USER turn only (see the `isUser` branch below —
   *  never rendered on an assistant turn). Absent `onEdit` hides the
   *  edit icon entirely rather than rendering a disabled one — same
   *  optional-callback-as-feature-flag pattern already used for
   *  `onCopy`/`onRegenerate`/`onFeedback` here. */
  onEdit?: ((message: ChatMessage, newContent: string) => void) | undefined;
  /** True while a stream is already sending/running elsewhere in this
   *  conversation — disables entering edit mode (editing calls
   *  use-chat-stream.ts's `edit`, which no-ops during an in-flight
   *  stream anyway; disabling the button too avoids a confusing "I
   *  clicked Edit and nothing happened"). */
  editDisabled?: boolean | undefined;
  /** P6.3a. True only for the assistant message currently being streamed. With
   *  no answer text yet, its Thinking block is "live" (open, animated). */
  streaming?: boolean | undefined;
  className?: string | undefined;
}

/**
 * apps/web/features/chat/components/message/message.tsx
 *
 * Real replacement for the deleted components/chat/message-bubble.tsx —
 * same visual language, ported 1:1 from docs/design/design-preview.html's
 * `.bubble` / `.msg-row` / `.msg-meta` / `.msg-actions` rules (around
 * line 300), now wired to next-intl (Rule 6) and the real, persisted
 * `ChatMessage` shape (features/chat/types.ts) instead of a local
 * placeholder type.
 *
 * Only ever called for `user`/`assistant` turns. `system` is a valid
 * `ChatMessage.role` (mirrors the DB enum) but is never a transcript
 * turn a person sees — MessageList filters those out before this
 * component receives one.
 *
 * Post-4d bugfix round: user content now also renders through
 * `SafeMarkdown`, same as the assistant turn — reverses the original 4d
 * decision (this comment used to say user content stays plain text
 * because it's "the person's own literal input, not model output").
 * Product call: a user who pastes a list, a code snippet, or uses
 * emphasis in their own message reads it back cleaner rendered than
 * literal. Rule 7's untrusted/trusted split was about the SANITIZATION
 * rules (no rehype-raw, no dangerouslySetInnerHTML, blocked remote
 * images, forced rel=noopener) — those apply equally whether the text
 * came from a model or from the user's own client, since a `<script>`-
 * shaped string is inert either way once it goes through
 * `react-markdown` with no raw-HTML plugin. Only cost: a user who
 * literally types `*`, `_`, or a lone backtick now sees it consumed as
 * formatting instead of shown as-is — including on already-persisted
 * historical messages, since this reads straight from `message.content`
 * with no stored "rendered as markdown at send time" flag.
 *
 * Phase 4d Patch v6: no avatar. The role is already unambiguous from
 * alignment (user bubbles sit end-aligned, assistant fill-width) plus
 * the per-message model-name/token/cost line under assistant turns —
 * a "U"/"AI" circle added nothing a screen reader or a sighted user
 * didn't already have, and it cost every row 30px + a gap for it.
 *
 * `React.memo`'d (post-4d bugfix round): `MessageList` re-renders on
 * every streamed chunk (the array reference changes each CHUNK action —
 * see chat-stream-reducer.ts), which previously re-rendered EVERY row
 * in the transcript on every chunk, not just the one streaming. Only the
 * fields actually read below are compared; `onCopy`/`onRegenerate`/
 * `onFeedback` are stable callbacks from chat-view.tsx (useCallback) so
 * reference equality holds for them across renders.
 */
function MessageImpl({
  message,
  onCopy,
  onRegenerate,
  onFeedback,
  onEdit,
  editDisabled,
  streaming,
  className,
}: MessageProps) {
  const t = useTranslations("chat");
  const tBalance = useTranslations("balance");
  const rawLocale = useLocale();
  const locale = rawLocale === "ar" ? "ar" : "en";
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.content);
  const [copied, setCopied] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Re-sync the draft if the underlying message content changes while
  // NOT editing (e.g. this row got reused for a different message via
  // some future virtualization) — but never while `isEditing`, or the
  // user's own in-progress keystrokes would be clobbered.
  React.useEffect(() => {
    if (!isEditing) setDraft(message.content);
  }, [message.content, isEditing]);

  const startEditing = React.useCallback(() => {
    setDraft(message.content);
    setIsEditing(true);
  }, [message.content]);

  const cancelEditing = React.useCallback(() => {
    setDraft(message.content);
    setIsEditing(false);
  }, [message.content]);

  const saveEditing = React.useCallback(() => {
    const trimmed = draft.trim();
    // Nothing typed, or unchanged from the original: treat as Cancel
    // rather than calling `onEdit` with a no-op/empty edit — `edit()`
    // in use-chat-stream.ts already no-ops on an empty string, but an
    // UNCHANGED resend would still truncate and re-run the assistant
    // reply for a turn that didn't actually change, wasting a real
    // provider call.
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      setDraft(message.content);
      return;
    }
    onEdit?.(message, trimmed);
    setIsEditing(false);
  }, [draft, message, onEdit]);

  const handleCopyUser = React.useCallback(() => {
    onCopy?.(message);
    void navigator.clipboard?.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [onCopy, message]);

  // Autofocus + place the caret at the end when edit mode opens, same
  // affordance a native "edit" action anywhere else gives you.
  React.useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  // Parts that render in the plain faint color, joined with " · " same
  // as before. The credit-cost part is rendered separately (in red) so
  // it stands out regardless of how "fresh" the message is — previously
  // this whole line only ever *looked* present once modelId/tokens/cost
  // had all arrived from the server, which for a message still showing
  // "just now"/"الآن" could read as if the line only shows up "after some
  // time". It doesn't hide itself; each part just renders the instant its
  // own field is populated, so keep them as independent fragments rather
  // than bailing out if one field is briefly missing.
  const metaParts: string[] = [];
  if (!isUser) {
    if (message.modelId) metaParts.push(message.modelId);
    if (typeof message.inputTokens === "number" && typeof message.outputTokens === "number") {
      metaParts.push(t("tokenCount", { count: message.inputTokens + message.outputTokens }));
    }
  }
  const creditCostLabel =
    !isUser && typeof message.creditCost === "number"
      ? `${formatCredits(message.creditCost, locale)} ${tBalance("unit")}`
      : null;

  return (
    // `min-w-0`: a flex item's default min-width is `auto` (its content's
    // intrinsic width), not 0 — without this, one long unbroken token in
    // `message.content` (a URL, a path, an id) forces THIS row wider than
    // the viewport instead of wrapping, and since nothing upstream of
    // MessageList clips horizontally either, that widened row is what let
    // the whole page pan left/right on mobile. `min-w-0` here plus
    // `break-words` on the two content nodes below is the actual fix;
    // `max-w-full` alone (already present) only bounds a node against a
    // PARENT that already has a fixed width, it does nothing against a
    // child forcing its own intrinsic size upward.
    <div className={cn("flex min-w-0 max-w-full", className)}>
      <div
        className={cn(
          "group flex min-w-0 flex-col gap-1.5",
          // `w-full` alongside `max-w-[86%]`: a flex column with no
          // explicit width sizes to its widest child (shrink-to-fit) —
          // for a plain-text user message that's harmless, but a fenced
          // code block inside it is `w-full` of ITS parent (CodeBlock,
          // see code-block.tsx), which only means anything once THIS
          // node has a real resolved width to be 100% of. Without `w-full`
          // here, the two `w-full`s chase each other: this column grows
          // to fit the code block's intrinsic content width instead of
          // clamping at 86% and letting CodeBlock's own `overflow-x-auto`
          // scroll internally — the empty-looking oversized bubble with a
          // stray floating Copy button bug. The assistant branch below
          // never hit this because its ancestor (`flex-1` in a row that
          // already has a resolved width from ChatView) already gives
          // `w-full` something concrete to resolve against.
          isUser ? "ms-auto w-full max-w-[86%] items-end" : "max-w-none flex-1"
        )}
      >
        {isUser && isEditing ? (
          // Edit mode replaces the bubble with an editable textarea in
          // the same visual shell (same border/radius/background), so
          // the row doesn't jump around the page while editing — plus
          // Save/Cancel where the timestamp/action row normally sits.
          <div className="w-full min-w-0 rounded-[18px] rounded-ee-[6px] border border-primary bg-accent-strong px-4 py-[13px] text-foreground">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends (same convention as the composer); Shift+Enter
                // inserts a newline. Escape cancels without saving.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEditing();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              rows={Math.min(10, Math.max(2, draft.split("\n").length))}
              className="w-full min-w-0 resize-none bg-transparent text-[15px] leading-[1.65] break-words [overflow-wrap:anywhere] text-foreground outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-full px-3 py-1 text-[12.5px] font-medium text-faint-foreground hover:bg-border hover:text-foreground"
              >
                {t("editCancel")}
              </button>
              <button
                type="button"
                onClick={saveEditing}
                className="rounded-full bg-primary px-3 py-1 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
              >
                {t("editSave")}
              </button>
            </div>
          </div>
        ) : isUser ? (
          <>
          {/* P6.3c: the files sent with this turn (display only; the server read them by id). */}
          {message.attachments && message.attachments.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((a) => (
                <li key={a.id} className="flex max-w-[14rem] items-center gap-2 rounded-xl border border-border bg-secondary py-1 ps-1 pe-2.5">
                  <FileGlyph name={a.fileName} kind={a.kind} className="size-7" />
                  <span dir="auto" className="truncate text-[12px] font-medium text-foreground">{a.fileName}</span>
                </li>
              ))}
            </ul>
          )}
          // `break-words [overflow-wrap:anywhere]`: still needed here even
          // though SafeMarkdown carries its own — this is the OUTER bubble
          // (border/background/padding), which must not stretch past
          // `max-w-[86%]` regardless of what's inside it. `whitespace-pre-
          // wrap` dropped: markdown's own paragraph/list/br handling now
          // owns line-break semantics inside this bubble, same as the
          // assistant side.
          //
          // `w-full`: this was the actual remaining overflow bug — this
          // div (not its parent column) is the one that visually IS the
          // bubble (border/background/padding), and it had no width of
          // its own, only `min-w-0`. `min-w-0` only stops CONTENT from
          // forcing this wider than it would otherwise be; it does
          // nothing to stop the bubble from shrink-wrapping SMALLER than
          // its `max-w-[86%]` parent column when the content is short,
          // which is fine for plain text but breaks the moment the
          // content is a CodeBlock/table — those size themselves as
          // `w-full` OF THIS DIV, and "100% of a box whose own width is
          // still being decided by that same box's shrink-to-fit content"
          // is exactly the circular sizing that let a wide code block or
          // table stretch this bubble past the parent's 86% cap instead
          // of clamping and scrolling internally. Giving this div its
          // own `w-full` resolves it against the ALREADY-FIXED 86%
          // column instead, so CodeBlock's/`table`'s internal
          // `overflow-x-auto` has a real, stable width to scroll within.
          <div className="w-full min-w-0 max-w-full rounded-[18px] rounded-ee-[6px] border border-primary bg-accent-strong px-4 py-[13px] break-words [overflow-wrap:anywhere] text-foreground">
            <SafeMarkdown content={message.content} className="pt-0" />
          </div>
          </>
        ) : (
          <>
            {message.thinking && (
              <ThinkingBlock
                trace={message.thinking}
                live={streaming === true && message.content.length === 0}
              />
            )}
            {/* A reasoning-only turn has no answer yet: skip the empty markdown
                node rather than leave a blank gap under the Thinking block. */}
            {(message.content.length > 0 || !message.thinking) && (
              <SafeMarkdown content={message.content} className="min-w-0 pt-1 pb-0.5" />
            )}
          </>
        )}

        {message.isPartial && (
          <button
            type="button"
            onClick={() => onRegenerate?.(message)}
            className="w-fit text-start text-[11.5px] font-medium text-faint-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("partialResponse")}
          </button>
        )}

        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-faint-foreground">
              {formatRelativeDate(message.createdAt, locale)}
            </span>
            {metaParts.length > 0 && (
              <span className="text-[11.5px] text-faint-foreground">· {metaParts.join(" · ")}</span>
            )}
            {creditCostLabel && (
              // Deliberately red regardless of theme (not `text-destructive`
              // or similar semantic token that might get muted in dark mode)
              // so a user can tell at a glance how much a reply consumed,
              // in both locales — this span has no `dir`/text dependency,
              // it renders identically for ar/en, just after the (already
              // locale-aware) formatCredits/tBalance strings above.
              <span className="text-[11.5px] font-medium text-red-500">
                · {creditCostLabel}
              </span>
            )}
            {!isUser && (
              <MessageActions
                className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                onCopy={() => onCopy?.(message)}
                onRegenerate={() => onRegenerate?.(message)}
                onFeedback={(value) => onFeedback?.(message, value)}
              />
            )}
            {isUser && (
              // Same two-icon shape as MessageActions (same `size-7`
              // IconButton dimensions there), kept as its own small
              // block here rather than extending MessageActions itself —
              // MessageActions' 4 icons (copy/regenerate/thumbs-up/down)
              // are all assistant-only concepts; copy+edit is a
              // deliberately different, smaller set for a user turn, not
              // a subset toggled by props off the same component.
              <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                <button
                  type="button"
                  aria-label={t("copy")}
                  title={t("copy")}
                  onClick={handleCopyUser}
                  className="inline-flex size-7 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                >
                  {copied ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                {onEdit && (
                  <button
                    type="button"
                    aria-label={t("edit")}
                    title={t("edit")}
                    disabled={editDisabled}
                    onClick={startEditing}
                    className="inline-flex size-7 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Custom comparator rather than a bare `React.memo(MessageImpl)`: the
 * default shallow-props check would already skip re-render correctly
 * for every OTHER row while one message streams, but this is explicit
 * about exactly which fields streaming mutates (`content`, `isPartial`)
 * versus fields that only ever change via user action elsewhere
 * (`feedback`) — anyone touching `ChatMessage` later has one place that
 * documents what this component actually depends on, instead of relying
 * on shallow-equal semantics being obviously "good enough" by accident.
 */
function messagePropsAreEqual(prev: MessageProps, next: MessageProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isPartial === next.message.isPartial &&
    prev.message.feedback === next.message.feedback &&
    prev.message.creditCost === next.message.creditCost &&
    prev.message.inputTokens === next.message.inputTokens &&
    prev.message.outputTokens === next.message.outputTokens &&
    prev.message.modelId === next.message.modelId &&
    prev.message.createdAt === next.message.createdAt &&
    prev.message.thinking === next.message.thinking &&
    prev.message.attachments === next.message.attachments &&
    prev.streaming === next.streaming &&
    prev.className === next.className &&
    prev.onCopy === next.onCopy &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onFeedback === next.onFeedback &&
    prev.onEdit === next.onEdit &&
    prev.editDisabled === next.editDisabled
  );
}

export const Message = React.memo(MessageImpl, messagePropsAreEqual);
