"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLoginRedirect, sanitizeNext } from "@/lib/safe-redirect";
import { useSession } from "@/lib/auth-client";
import { MessageList } from "./message/message-list";
import { ComposerBar } from "./composer/composer-bar";
import { OfflineBanner } from "./offline-banner";
import { TabConflictBanner } from "./tab-conflict-banner";
import { useChatModels } from "../hooks/use-chat-models";
import { useChatParams } from "../hooks/use-chat-params";
import { useChatStream } from "../hooks/use-chat-stream";
import { useConversationMessages } from "../hooks/use-conversation-messages";
import { useConversationCacheIdentity } from "../hooks/use-conversation-cache-identity";
import { generateConversationId, conversationPath } from "../lib/new-chat";
import { setPendingFirstMessage, takePendingFirstMessage } from "../lib/pending-first-message";
import type { ChatMessage, ConversationParams } from "../types";
import type { ChatModel } from "../lib/model-selection";

export interface ChatViewProps {
  /** undefined = the empty `/chat` state, no conversation yet. */
  conversationId: string | undefined;
  className?: string;
}

/**
 * apps/web/features/chat/components/chat-view.tsx
 *
 * Phase 4d. The assembly point named in this phase's own summary: wires
 * useConversationMessages + useChatModels + useChatParams + useChatStream
 * + ComposerBar + MessageList into one conversation's worth of UI, for
 * BOTH `/chat` (conversationId undefined — empty state) and `/chat/[id]`
 * (an existing or just-created conversation) — see each page file for
 * why one component covers both rather than two near-duplicates.
 *
 * WHY THE INNER `ChatSession` SPLIT (read before changing the mount
 * gating below): `useChatStream`'s `initialMessages` option only takes
 * effect on that hook's FIRST render (React's lazy-init form — see that
 * hook's own header comment). `useConversationMessages` resolves
 * ASYNCHRONOUSLY (cache-first, then network) — so if `useChatStream`
 * mounted immediately alongside it, its first render would almost
 * always see an empty, not-yet-loaded history and permanently seed on
 * that empty array, discarding the real history once it arrived a beat
 * later. The fix: `ChatSession` (the child that actually calls
 * `useChatStream`) is only MOUNTED once `useConversationMessages` has
 * resolved (`historyReady` below) — its first render is then guaranteed
 * to already have the real messages. `key={conversationId ?? "new"}`
 * additionally forces a full remount on every conversation switch
 * (sidebar click while already viewing a different one), so a stale
 * `ChatSession` instance never carries the previous conversation's
 * reducer state into the new one.
 *
 * NEW-CHAT HANDOFF: when `conversationId` is undefined, `historyReady`
 * is true immediately (there is nothing to load), so `ChatSession`
 * mounts right away with `initialMessages: []`. Its composer's `onSend`
 * does NOT call `useChatStream`'s own `send()` in this state — per
 * `new-chat.ts`'s contract, `send()` must never be called before an id
 * exists. Instead it generates the id, stashes the draft via
 * `pending-first-message.ts`, and navigates to `/chat/[id]`; that page's
 * own freshly-mounted `ChatSession` picks the draft back up (see the
 * `takePendingFirstMessage` effect below) and sends it from ITS OWN,
 * post-navigation instance — see pending-first-message.ts's header
 * comment for why the send has to happen after the navigation, not
 * before it.
 */
export function ChatView({ conversationId, className }: ChatViewProps) {
  useConversationCacheIdentity();

  const {
    messages: history,
    isLoading: isLoadingHistory,
    conversationModelId,
  } = useConversationMessages(conversationId);
  const historyReady = !conversationId || !isLoadingHistory;

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col", className)}>
      {historyReady ? (
        <ChatSession
          key={conversationId ?? "new"}
          conversationId={conversationId}
          initialMessages={history}
          conversationModelId={conversationModelId}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ms-auto h-10 w-1/2" />
          <Skeleton className="h-24 w-3/4" />
        </div>
      )}
    </div>
  );
}

interface ChatSessionProps {
  conversationId: string | undefined;
  initialMessages: ChatMessage[];
  /** Phase 4d patch. This existing conversation's own model, once known
   *  (undefined for a brand-new conversation, or before the network call
   *  resolves) — see useConversationMessages's own doc comment. */
  conversationModelId: string | undefined;
}

function ChatSession({ conversationId, initialMessages, conversationModelId }: ChatSessionProps) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();

  const [draft, setDraft] = React.useState("");
  const conversationExists = Boolean(conversationId) && initialMessages.length === 0 ? false : Boolean(conversationId);
  // ^ A brand-new id with no history yet has no server row either (lazy
  // insert on first send — conversation-api.ts's header comment). Both
  // "no id at all" and "id exists client-side but not server-side yet"
  // must tell useChatParams the same thing: nothing to GET/PATCH against
  // yet, ride the system prompt on the first send's body instead.
  // A real EXISTING conversation with a genuinely empty transcript
  // (all messages somehow deleted) is not a case B1 produces today, so
  // this heuristic is safe in practice — flagged rather than silently
  // assumed, since it is a heuristic and not a field the server sends.

  // Phase 4d patch: `conversationModelId` now comes from
  // useConversationMessages (conversation-api.ts's fetchConversationModelId),
  // closing the gap flagged in the 4d session — see
  // docs/frontend/BRANCH_AND_CI_NOTES.md's 4d entry for the prior
  // simplification this replaces. `resolveSelectedModelId`'s own
  // precedence (session pick > conversation's own model > last-picked >
  // first available) is unchanged; this just supplies the middle tier
  // with real data instead of always leaving it undefined.
  const { models, selectedId, select } = useChatModels({ conversationModelId });
  const { params, setParams, systemPrompt, setSystemPrompt } = useChatParams({
    conversationId,
    conversationExists,
  });
  const stream = useChatStream({
    conversationId,
    model: selectedId ?? "",
    params,
    systemPrompt,
    initialMessages,
  });

  const isBusy = stream.status === "sending" || stream.status === "streaming";

  // Redirect on a 401 surfaced mid-stream (use-chat-stream.ts's own
  // contract: this hook never redirects itself). sanitizeNext() is the
  // same gate the login flow itself uses (Rule 4) — an untrusted
  // server-supplied target is never navigated to unchecked.
  React.useEffect(() => {
    if (!stream.error?.redirectTo) return;
    const safe = sanitizeNext(stream.error.redirectTo);
    router.push(safe ?? buildLoginRedirect(locale));
  }, [stream.error, locale, router]);

  // New-chat handoff: consume this id's stashed first message (if any)
  // exactly once, after this instance's own history has already been
  // established (see ChatView's header comment).
  const consumedPendingRef = React.useRef(false);
  React.useEffect(() => {
    if (!conversationId || consumedPendingRef.current) return;
    const pending = takePendingFirstMessage(conversationId);
    if (pending) {
      consumedPendingRef.current = true;
      stream.send(pending);
    }
    // stream.send is stable across renders (useCallback in use-chat-stream.ts);
    // intentionally re-running only on a conversationId change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!conversationId) {
      const id = generateConversationId();
      setPendingFirstMessage(id, trimmed);
      setDraft("");
      router.push(conversationPath(locale, id));
      return;
    }
    stream.send(trimmed);
    setDraft("");
  };

  const userInitial = session?.user?.name?.trim().charAt(0) || undefined;
  const isNewChat = !conversationId;

  return (
    // `min-w-0`: closes the same flex-item-default-min-width gap one more
    // level up (see message-list.tsx's and message.tsx's own comments on
    // this chain) — this is itself a flex child of AppShell's `<Main>`.
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-col gap-2">
        <OfflineBanner />
        <TabConflictBanner conversationId={conversationId} isSending={isBusy} />
      </div>

      {isNewChat && stream.messages.length === 0 ? (
        <EmptyState onPick={(prompt) => setDraft(prompt)} />
      ) : (
        // min-h-0 alongside flex-1: a flex child's default min-height is
        // "auto" (i.e. its content's natural height), which is what let
        // this element grow to fit the whole transcript instead of
        // shrinking to the space ChatSession actually has and letting
        // its own `overflow-y-auto` (message-list.tsx) do the scrolling
        // — that growth is what dragged the composer below it up and
        // down with the conversation on mobile. See Main's and
        // AppShell's own comments for the rest of this fix's chain.
        <MessageList
          messages={stream.messages}
          error={stream.error ?? undefined}
          userInitial={userInitial}
          onCopy={() => {}}
          onRegenerate={() => stream.retry()}
          onFeedback={() => {}}
          onRetryError={() => stream.retry()}
          className="min-h-0 flex-1"
        />
      )}

      {isBusy && (
        <Button type="button" variant="outline" size="sm" className="self-center" onClick={() => stream.stop()}>
          {t("stop")}
        </Button>
      )}

      <ComposerBar
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        disabled={isBusy}
        models={models}
        selectedModelId={selectedId}
        onSelectModel={select}
        history={stream.messages.map((m) => ({ content: m.content }))}
        parametersEnabled
        params={params}
        onParamsChange={setParams}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
      />
    </div>
  );
}

interface EmptyStateProps {
  onPick: (prompt: string) => void;
}

/**
 * The `/chat` empty state: heading + suggestion chips
 * (`messages/{ar,en}.json`'s `chat.suggestions`, already scaffolded).
 * Picking a suggestion fills the draft — it does NOT send immediately,
 * so the person can edit it first, consistent with every other draft
 * entry path into the same composer.
 */
function EmptyState({ onPick }: EmptyStateProps) {
  const t = useTranslations("chat");
  const suggestions = t.raw("suggestions") as { label: string; prompt: string }[];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center overflow-y-auto">
      <h1 className="t-h2">{t("emptyStateTitle")}</h1>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <Button key={s.label} type="button" variant="outline" size="sm" onClick={() => onPick(s.prompt)}>
            {s.label}
          </Button>
        ))}
      </div>
      <p className="t-small max-w-md text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}

// Re-exported only so a consumer importing ChatView doesn't also need a
// separate import of ChatModel purely to type a `models` prop pass-through
// in a future caller — this file is the only one that currently needs it.
export type { ChatModel, ConversationParams };
