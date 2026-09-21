"use client";

import * as React from "react";

import { DEFAULT_CONVERSATION_PARAMS, type ConversationParams } from "../types";
import { readParams, writeParams } from "../lib/chat-params-storage";
import {
  fetchConversationSystemPrompt,
  patchConversationSystemPrompt,
} from "../lib/conversation-api";

export interface UseChatParamsOptions {
  /** undefined until a conversation exists. */
  conversationId: string | undefined;
  /** True once the row exists server-side. A brand-new conversation has no
   *  row until the first POST /api/chat (lazy insert), so there is nothing
   *  to PATCH or GET yet — the prompt just rides on the send body. */
  conversationExists: boolean;
  /** Debounce for PATCH so typing doesn't fire a request per keystroke. */
  patchDelayMs?: number;
}

export type SystemPromptSaveState = "idle" | "saving" | "saved" | "error";

export interface UseChatParamsResult {
  params: ConversationParams;
  setParams: (next: ConversationParams) => void;
  systemPrompt: string;
  setSystemPrompt: (next: string) => void;
  saveState: SystemPromptSaveState;
}

/**
 * apps/web/features/chat/hooks/use-chat-params.ts
 *
 * Phase 4c. Owns the four generation parameters for one conversation:
 *  - temperature / top_p / max_tokens → client-side, keyed by conversation
 *    id (lib/chat-params-storage.ts; see its header for why these are not
 *    server-persisted — B1 has no columns/route for them).
 *  - systemPrompt → server-side. Loaded via GET when the row exists; saved
 *    via a DEBOUNCED PATCH when it changes on an existing row.
 *
 * RACE HANDLING: loading a saved prompt is async. If the user starts
 * typing before it arrives, the late response must NOT overwrite what they
 * typed. `userEditedRef` records the first edit; the load only applies
 * while it is still false. Likewise a conversation switch discards a
 * stale in-flight load (`cancelled` flag) and any pending PATCH for the
 * previous conversation is flushed against ITS OWN id, never the new one.
 *
 * WHAT IS DELIBERATELY NOT HERE: a PATCH for a conversation whose row
 * doesn't exist yet (see `conversationExists`) — the /api/chat body carries
 * the prompt for that first send, and gateway.service.ts persists it on
 * insert.
 */
export function useChatParams({
  conversationId,
  conversationExists,
  patchDelayMs = 800,
}: UseChatParamsOptions): UseChatParamsResult {
  const [params, setParamsState] = React.useState<ConversationParams>(DEFAULT_CONVERSATION_PARAMS);
  const [systemPrompt, setSystemPromptState] = React.useState("");
  const [saveState, setSaveState] = React.useState<SystemPromptSaveState>("idle");

  const userEditedRef = React.useRef(false);
  const lastSavedRef = React.useRef<string>("");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The save that is scheduled but hasn't fired yet, so a conversation
  // switch / unmount can FLUSH it instead of silently dropping the edit.
  const pendingRef = React.useRef<{ id: string; value: string } | undefined>(undefined);

  // ── numeric params: load per conversation ──────────────────────────
  React.useEffect(() => {
    setParamsState(conversationId ? readParams(conversationId) : DEFAULT_CONVERSATION_PARAMS);
  }, [conversationId]);

  const setParams = React.useCallback(
    (next: ConversationParams) => {
      setParamsState(next);
      // No id yet → held in state only; it is written once an id exists
      // (see the effect below), so a draft made before the first send isn't lost.
      if (conversationId) writeParams(conversationId, next);
    },
    [conversationId],
  );

  // A conversation id can appear AFTER params were set (first send creates
  // it). Persist whatever the user had chosen under the new id.
  const prevIdRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const prev = prevIdRef.current;
    prevIdRef.current = conversationId;
    if (conversationId && prev === undefined) writeParams(conversationId, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on id transition
  }, [conversationId]);

  // ── system prompt: load when the row exists ────────────────────────
  React.useEffect(() => {
    userEditedRef.current = false;
    lastSavedRef.current = "";
    setSaveState("idle");
    if (!conversationId || !conversationExists) {
      setSystemPromptState("");
      return;
    }
    let cancelled = false;
    void fetchConversationSystemPrompt(conversationId).then((r) => {
      if (cancelled || !r.ok || userEditedRef.current) return;
      lastSavedRef.current = r.value;
      setSystemPromptState(r.value);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversationExists]);

  // ── system prompt: debounced PATCH on change ───────────────────────
  const setSystemPrompt = React.useCallback(
    (next: string) => {
      userEditedRef.current = true;
      setSystemPromptState(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!conversationId || !conversationExists) {
        pendingRef.current = undefined;
        return; // rides on the send body instead
      }
      const id = conversationId; // captured: a switch must not redirect this PATCH
      pendingRef.current = { id, value: next };
      timerRef.current = setTimeout(() => {
        pendingRef.current = undefined;
        if (next === lastSavedRef.current) {
          setSaveState("idle");
          return;
        }
        setSaveState("saving");
        void patchConversationSystemPrompt(id, next).then((r) => {
          if (r.ok) {
            lastSavedRef.current = next;
            setSaveState("saved");
          } else {
            setSaveState("error");
          }
        });
      }, patchDelayMs);
    },
    [conversationId, conversationExists, patchDelayMs],
  );

  // On conversation switch / unmount: cancel the timer but FLUSH the
  // pending save against the id it was made for. Dropping it would lose an
  // edit made within `patchDelayMs` of navigating away. Fire-and-forget:
  // the component is going away, there is no state left to update, and a
  // failure here is not recoverable from this hook anyway.
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = undefined;
      if (pending && pending.value !== lastSavedRef.current) {
        void patchConversationSystemPrompt(pending.id, pending.value);
      }
    };
  }, [conversationId]);

  return { params, setParams, systemPrompt, setSystemPrompt, saveState };
}
