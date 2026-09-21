"use client";

import * as React from "react";

import { trpc } from "@/lib/trpc";
import { readLastModel, writeLastModel } from "../lib/chat-params-storage";
import { resolveSelectedModelId, type ChatModel } from "../lib/model-selection";

export interface UseChatModelsOptions {
  /** The model the current conversation already uses (if it exists yet). */
  conversationModelId?: string | undefined;
}

export interface UseChatModelsResult {
  models: readonly ChatModel[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** undefined until models load, or if none are available. */
  selectedId: string | undefined;
  selectedModel: ChatModel | undefined;
  select: (id: string) => void;
}

/**
 * apps/web/features/chat/hooks/use-chat-models.ts
 *
 * Phase 4c. `models.list` is a `publicProcedure` (apps/api/src/routers/
 * models.router.ts) that returns ONLY status="published" AND
 * isAvailable=true rows — so an unpublished/disabled model can never
 * appear here, and `resolveSelectedModelId` additionally guards against a
 * stale id saved in localStorage.
 *
 * The last-picked id is read from localStorage in an effect, NOT during
 * render: `readLastModel()` is undefined on the server, so reading it
 * during the first render would produce different server and client
 * output (a hydration mismatch). Until the effect runs, `lastPicked` is
 * undefined and selection falls back to the conversation's / first model.
 *
 * `select` writes through to localStorage (registered with the sign-out
 * clearer in ../lib/chat-params-storage.ts — Rule 9). It is only ever
 * called from an explicit user pick, never from the fallback resolution,
 * so merely LOADING the page never overwrites the user's remembered
 * choice with "the first model in the list".
 */
export function useChatModels({ conversationModelId }: UseChatModelsOptions = {}): UseChatModelsResult {
  const query = trpc.models.list.useQuery(undefined, {
    // The published catalogue changes rarely (admin action); avoid
    // refetching on every window focus, which would make the picker
    // flicker for no benefit.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Two separate pieces of state on purpose:
  //  - `lastPicked`: the PERSISTED choice, read once from localStorage.
  //  - `sessionPicked`: what the user clicked in THIS mount. It outranks
  //    the conversation's own model (see resolveSelectedModelId, tier 0),
  //    so an explicit pick is honoured on an existing conversation.
  const [lastPicked, setLastPicked] = React.useState<string | undefined>(undefined);
  const [sessionPicked, setSessionPicked] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    setLastPicked(readLastModel());
  }, []);

  const models: readonly ChatModel[] = query.data ?? [];

  const selectedId = React.useMemo(
    () =>
      resolveSelectedModelId(models, {
        sessionPickedModelId: sessionPicked,
        conversationModelId,
        lastPickedModelId: lastPicked,
      }),
    [models, sessionPicked, conversationModelId, lastPicked],
  );

  const select = React.useCallback((id: string) => {
    setSessionPicked(id);
    setLastPicked(id);
    writeLastModel(id);
  }, []);

  const selectedModel = React.useMemo(
    () => models.find((m) => m.id === selectedId),
    [models, selectedId],
  );

  return {
    models,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    selectedId,
    selectedModel,
    select,
  };
}
