"use client";

import * as React from "react";

import {
  attachErrorKey, classifyFile, rejectKey, type AttachErrorKey,
} from "../lib/attach-types";
import { readAttachEnabled } from "../lib/attach-flag";
import { fetchAttachmentsAvailable, uploadAttachment } from "../lib/attachments-client";
import { attachReducer, isUploading, readyAttachments, remainingSlots, type AttachItem } from "../lib/attachments-state";
import type { ChatAttachment } from "../types";

/**
 * apps/web/features/chat/hooks/use-attachments.ts
 *
 * P6.3c. Owns what is impure about attaching: the flag, the availability probe, the uploads and their
 * abort controllers. The decisions are in lib/attach-types.ts and lib/attachments-state.ts, the network
 * in lib/attachments-client.ts (all tested); this file is glue and needs a real browser to verify.
 *
 * The attach button is offered only when (1) this browser has the flag, (2) the host says storage is
 * configured (GET /api/attachments/status), and (3) the caller wired a conversation id source. Until
 * (2) is answered the button is simply absent, never shown-then-removed.
 *
 * `ensureConversationId` is how first-chat attach works: an attachment belongs to a conversation row,
 * and a brand-new chat has none yet, so the caller creates it on the first attach (chat-view.tsx).
 */
export interface UseAttachmentsOptions {
  enabled: boolean;
  /** The id of the conversation to attach to, creating the row first in a brand-new chat. null = could not. */
  ensureConversationId: () => Promise<string | null>;
}

export interface AttachControls {
  /** The browser flag is on (and the caller is wired). The composer keeps its old placeholder when false. */
  flagOn: boolean;
  /** Flag on AND storage is configured on the host: show the attach button. */
  available: boolean;
  items: AttachItem[];
  /** Some file is still uploading or being read: sending must wait. */
  uploading: boolean;
  /** How many more files may be added. */
  slots: number;
  /** Latest refusal to show as a hint (`n` makes the same message re-fire). */
  notice: { key: AttachErrorKey; n: number } | null;
  addFiles: (files: File[]) => void;
  remove: (localId: string) => void;
  /** Ready files to send with the next message. */
  ready: ChatAttachment[];
  /** After a send: forget the list (finished uploads stay on the server, tied to the conversation). */
  clear: () => void;
}

export function useAttachments(opts: UseAttachmentsOptions): AttachControls {
  const [items, dispatch] = React.useReducer(attachReducer, [] as AttachItem[]);
  const [flag, setFlag] = React.useState(false);
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [notice, setNotice] = React.useState<{ key: AttachErrorKey; n: number } | null>(null);

  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const noticeCount = React.useRef(0);
  const controllers = React.useRef(new Map<string, AbortController>());
  const aliveRef = React.useRef(true);

  const notify = React.useCallback((key: AttachErrorKey) => {
    noticeCount.current += 1;
    setNotice({ key, n: noticeCount.current });
  }, []);

  // After mount only: SSR has no localStorage and hydration must match.
  React.useEffect(() => {
    setFlag(opts.enabled && readAttachEnabled());
  }, [opts.enabled]);

  React.useEffect(() => {
    if (!flag) return;
    const ctrl = new AbortController();
    void fetchAttachmentsAvailable(fetch, ctrl.signal).then((ok) => {
      if (!ctrl.signal.aborted) setAvailable(ok);
    });
    return () => ctrl.abort();
  }, [flag]);

  React.useEffect(() => {
    aliveRef.current = true;
    const map = controllers.current;
    return () => {
      aliveRef.current = false;
      map.forEach((c) => c.abort());
      map.clear();
    };
  }, []);

  const addFiles = React.useCallback(
    (files: File[]) => {
      if (!aliveRef.current || files.length === 0) return;
      const slots = remainingSlots(itemsRef.current);
      const batch: { localId: string; file: File; mime: string; kind: "image" | "document" }[] = [];
      for (const file of files) {
        const c = classifyFile(file);
        if (!c.ok) {
          notify(rejectKey(c.reason));
          continue;
        }
        if (batch.length >= slots) {
          notify("attachRejectTooMany");
          break;
        }
        batch.push({ localId: crypto.randomUUID(), file, mime: c.mimeType, kind: c.kind });
      }
      if (batch.length === 0) return;

      for (const b of batch) {
        const item: AttachItem = {
          localId: b.localId, fileName: b.file.name, sizeBytes: b.file.size, kind: b.kind, status: "uploading", stage: "uploading",
        };
        // Applied to the ref at once too, so two quick picks cannot both pass the 5-file check.
        itemsRef.current = attachReducer(itemsRef.current, { type: "ADD", item });
        dispatch({ type: "ADD", item });
      }

      void (async () => {
        const convId = await optsRef.current.ensureConversationId();
        await Promise.all(
          batch.map(async (b) => {
            if (!convId) {
              dispatch({ type: "FAIL", localId: b.localId, errorKey: "attachErrConversation" });
              return;
            }
            const ctrl = new AbortController();
            controllers.current.set(b.localId, ctrl);
            const r = await uploadAttachment({
              file: b.file,
              mimeType: b.mime,
              conversationId: convId,
              signal: ctrl.signal,
              onStage: (stage) => dispatch({ type: "STAGE", localId: b.localId, stage }),
            });
            controllers.current.delete(b.localId);
            if (!aliveRef.current || ctrl.signal.aborted) return;
            if (r.ok) {
              dispatch({
                type: "READY", localId: b.localId, attachmentId: r.value.id, fileName: r.value.fileName,
                sizeBytes: r.value.sizeBytes, truncated: r.value.truncated,
              });
            } else {
              if (r.code === "STORAGE_DISABLED") setAvailable(false);
              dispatch({ type: "FAIL", localId: b.localId, errorKey: attachErrorKey(r.code) });
            }
          }),
        );
      })();
    },
    [notify],
  );

  const remove = React.useCallback((localId: string) => {
    controllers.current.get(localId)?.abort();
    controllers.current.delete(localId);
    itemsRef.current = attachReducer(itemsRef.current, { type: "REMOVE", localId });
    dispatch({ type: "REMOVE", localId });
  }, []);

  const clear = React.useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    itemsRef.current = [];
    dispatch({ type: "CLEAR" });
  }, []);

  return {
    flagOn: flag,
    available: flag && available === true,
    items,
    uploading: isUploading(items),
    slots: remainingSlots(items),
    notice,
    addFiles,
    remove,
    ready: readyAttachments(items),
    clear,
  };
}
