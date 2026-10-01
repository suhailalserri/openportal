import type { ChatAttachment } from "../types";
import type { AttachErrorKey } from "./attach-types";
import { ATTACH_LIMITS } from "./attach-types";

/**
 * apps/web/features/chat/lib/attachments-state.ts
 *
 * P6.3c. The composer's list of files being attached, as a pure reducer (the hook owns the network).
 * One item per picked file: uploading -> ready, or error. Only `ready` items are sent with the message.
 */
export type AttachStage = "uploading" | "reading";

export interface AttachItem {
  localId: string;
  fileName: string;
  sizeBytes: number;
  kind: "image" | "document";
  status: "uploading" | "ready" | "error";
  stage?: AttachStage | undefined;
  /** Server id, set when ready. */
  attachmentId?: string | undefined;
  errorKey?: AttachErrorKey | undefined;
  /** The server cut the extracted text to fit the limit (shown as a note on the chip). */
  truncated?: boolean | undefined;
}

export type AttachAction =
  | { type: "ADD"; item: AttachItem }
  | { type: "STAGE"; localId: string; stage: AttachStage }
  | { type: "READY"; localId: string; attachmentId: string; fileName: string; sizeBytes: number; truncated: boolean }
  | { type: "FAIL"; localId: string; errorKey: AttachErrorKey }
  | { type: "REMOVE"; localId: string }
  | { type: "CLEAR" };

export function attachReducer(state: AttachItem[], action: AttachAction): AttachItem[] {
  switch (action.type) {
    case "ADD":
      return state.some((i) => i.localId === action.item.localId) ? state : [...state, action.item];
    case "STAGE":
      return state.map((i) => (i.localId === action.localId && i.status === "uploading" ? { ...i, stage: action.stage } : i));
    case "READY":
      return state.map((i) =>
        i.localId === action.localId && i.status === "uploading"
          ? { ...i, status: "ready", stage: undefined, attachmentId: action.attachmentId, fileName: action.fileName, sizeBytes: action.sizeBytes, truncated: action.truncated }
          : i,
      );
    case "FAIL":
      return state.map((i) => (i.localId === action.localId && i.status === "uploading" ? { ...i, status: "error", stage: undefined, errorKey: action.errorKey } : i));
    case "REMOVE":
      return state.filter((i) => i.localId !== action.localId);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

export const readyAttachments = (items: AttachItem[]): ChatAttachment[] =>
  items.flatMap((i) => (i.status === "ready" && i.attachmentId ? [{ id: i.attachmentId, fileName: i.fileName, kind: i.kind, sizeBytes: i.sizeBytes }] : []));

export const isUploading = (items: AttachItem[]): boolean => items.some((i) => i.status === "uploading");

/** How many more files the person may add (errors do not count: they can be removed or retried). */
export const remainingSlots = (items: AttachItem[]): number =>
  Math.max(0, ATTACH_LIMITS.maxFiles - items.filter((i) => i.status !== "error").length);
