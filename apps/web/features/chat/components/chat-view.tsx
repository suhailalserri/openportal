"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLoginRedirect, sanitizeNext } from "@/lib/safe-redirect";
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
import { setPendingFirstMessage, takePendingFirstMessage, hasPendingFirstMessage } from "../lib/pending-first-message";
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
  // The extra `hasPendingFirstMessage` check is what actually removes the
  // "refresh"-looking flash on first send: without it, the freshly
  // client-generated id still goes through one full loading pass (the
  // skeleton branch below) purely to fetch history that provably doesn't
  // exist yet — that pass, immediately followed by ChatSession mounting
  // and the composer reappearing, is what reads as a page reload. A
  // pending stash under this id can only exist if THIS tab's own
  // new-chat handoff just created it a moment ago (module-level Map,
  // never survives a real reload — see pending-first-message.ts), so
  // treating it as ready is not a guess.
  const historyReady = !conversationId || !isLoadingHistory || hasPendingFirstMessage(conversationId);

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col", className)}>
      {historyReady ? (
        // `animate-in fade-in`: this is still a genuine remount (the
        // `key` below is unchanged — see this component's own header
        // comment for why ChatSession must remount per-conversation),
        // but a full-page-refresh IMPRESSION was never actually about
        // remounting being wrong, just about the swap being a single
        // opaque frame: skeleton (below) instantly replaced by the real
        // ChatSession, including the composer, with nothing in between.
        // A short fade-in on whichever side just mounted turns that same
        // remount into something that reads as a transition instead of a
        // reload, at zero cost to the "fresh reducer per conversation"
        // contract this split exists for.
        <div key={conversationId ?? "new"} className="flex h-full min-h-0 flex-1 flex-col animate-in fade-in duration-200">
          <ChatSession
            conversationId={conversationId}
            initialMessages={history}
            conversationModelId={conversationModelId}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 animate-in fade-in duration-150">
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
  const locale = useLocale();
  const router = useRouter();

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

  // Screen-reader announcement (9.1). Deliberately NOT a live region over
  // the streaming text itself — that would re-read the whole growing
  // message on every token. Announce once when the reply starts and once
  // when it finishes; the transcript stays a normal, navigable list.
  const tLive = useTranslations("chat");
  const wasBusy = React.useRef(false);
  const [liveMessage, setLiveMessage] = React.useState("");
  React.useEffect(() => {
    if (isBusy) {
      wasBusy.current = true;
      setLiveMessage(tLive("thinking"));
    } else if (wasBusy.current) {
      wasBusy.current = false;
      setLiveMessage(tLive("responseReady"));
    }
  }, [isBusy, tLive]);

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

  // Stable identities (useCallback) rather than inline arrows in the
  // JSX below: `Message` is `React.memo`'d specifically so that only
  // the ONE row actually streaming re-renders per chunk (message.tsx's
  // own header comment) — a fresh `() => {}` on every ChatSession render
  // for these props would defeat that memoization for every row's
  // callback props, on every single chunk.
  const handleCopyMessage = React.useCallback((message: ChatMessage) => {
    void navigator.clipboard?.writeText(message.content);
  }, []);

  const handleRegenerate = React.useCallback(() => {
    stream.retry();
  }, [stream]);

  // NOT WIRED — flagged, not fixed (see docs/frontend/BRANCH_AND_CI_NOTES.md
  // Patch v10). No persistence endpoint exists for `messages.feedback`
  // yet (conversation-api.ts only ever READS it off a fetched row —
  // grep the repo, there is no PATCH/mutation call anywhere). Left as an
  // explicit no-op rather than silently wired to something that looks
  // like it works but doesn't persist.
  const handleFeedback = React.useCallback(() => {}, []);

  const handleEditMessage = React.useCallback(
    (message: ChatMessage, newContent: string) => {
      stream.edit(message.id, newContent);
    },
    [stream],
  );

  const isNewChat = !conversationId;

  return (
    // `min-w-0`: closes the same flex-item-default-min-width gap one more
    // level up (see message-list.tsx's and message.tsx's own comments on
    // this chain) — this is itself a flex child of AppShell's `<Main>`.
    //
    // Phase 4d Patch v6: no `p-4`/`gap-3` here any more. Both used to add
    // a flat, always-present strip of solid `bg-background` between the
    // header and the first message (the padding) and another above the
    // composer (the flex gap) — same colour as the page, so it read as a
    // blank cut rather than intentional spacing (confirmed via the
    // deployed preview's own inspector: toggling this div's `.p-4` off
    // visibly removed it). Each child below now owns its OWN inset
    // instead, sized to what it actually needs, and MessageList supplies
    // the "fade" look at its own top/bottom edges rather than a hard
    // padding edge — see that file's header comment.
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
      <div className="flex flex-col gap-2 px-4">
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
          onCopy={handleCopyMessage}
          onRegenerate={handleRegenerate}
          onFeedback={handleFeedback}
          onEdit={handleEditMessage}
          editDisabled={isBusy}
          onRetryError={() => stream.retry()}
          // "sending" is specifically the gap between the user's turn
          // landing and the assistant's first token — see
          // chat-stream-reducer.ts's own CHUNK-branch comment. Once a
          // single delta arrives status flips to "streaming" and the
          // real (growing) assistant bubble takes over from here, so
          // this never overlaps with the streaming cursor in message.tsx.
          isWaitingForReply={stream.status === "sending"}
          className="min-h-0 flex-1"
        />
      )}

      <div className="px-4 pt-2 pb-4">
        <ComposerBar
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          isStreaming={isBusy}
          onStop={() => stream.stop()}
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-6 text-center">
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
