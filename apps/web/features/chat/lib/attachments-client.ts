import { callJson, type VoiceResult } from "./voice-client";

/**
 * apps/web/features/chat/lib/attachments-client.ts
 *
 * P6.3c. The network half of attaching a file, as plain functions over an injectable `fetch`:
 *
 *   POST /api/attachments/upload-url  { conversationId, fileName, mimeType, sizeBytes } -> { attachmentId, uploadUrl, ... }
 *   PUT  uploadUrl                    (the file, straight to storage; never through our servers)
 *   POST /api/attachments/confirm     { attachmentId } -> queues text extraction
 *   POST /api/attachments/get         { attachmentId } -> polled until `ready` or `failed`
 *
 * Failures are reported as stable CODES (see attachErrorKey in attach-types.ts). Nothing here is billed
 * (attachments cost nothing until a chat turn uses them), so unlike voice a failed step may simply be
 * retried by the person.
 */

export type AttachResult<T> = VoiceResult<T>;

type FetchLike = typeof fetch;

export interface UploadedAttachment {
  id: string;
  fileName: string;
  kind: "image" | "document";
  sizeBytes: number;
  truncated: boolean;
}

interface AttachmentView {
  id?: string;
  fileName?: string;
  kind?: string;
  sizeBytes?: number;
  status?: string;
  errorCode?: string | null;
  truncated?: boolean;
}

export async function fetchAttachmentsAvailable(fetchImpl: FetchLike = fetch, signal?: AbortSignal): Promise<boolean> {
  const r = await callJson<{ available?: unknown }>(fetchImpl, "/api/attachments/status", { method: "GET", signal });
  return r.ok && r.value.available === true;
}

/**
 * Creates the conversation row an attachment must belong to (POST /api/conversations, the existing
 * route). Used when someone attaches a file in a brand-new chat, whose row would otherwise only appear
 * with its first message. The server fills the title and model in when that message arrives.
 */
export async function createConversationRow(fetchImpl: FetchLike = fetch, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetchImpl("/api/conversations", { method: "POST", ...(signal ? { signal } : {}) });
    if (!res.ok) return null;
    const j = (await res.json()) as { id?: unknown };
    return typeof j.id === "string" && j.id.length > 0 ? j.id : null;
  } catch {
    return null;
  }
}

export interface UploadInput {
  file: Blob & { name: string };
  /** From classifyFile: the type declared to the server (text files are "text/plain"). */
  mimeType: string;
  conversationId: string;
  signal?: AbortSignal | undefined;
  fetchImpl?: FetchLike | undefined;
  /** "uploading" while bytes go up, "reading" while the server extracts the text. */
  onStage?: ((stage: "uploading" | "reading") => void) | undefined;
  /** Test seam. */
  sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  /** Give up waiting for extraction after this long. The server's own limit is 20 s plus queue time. */
  maxWaitMs?: number | undefined;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

function toUploaded(v: AttachmentView, fallback: { id: string; fileName: string; sizeBytes: number }): UploadedAttachment {
  return {
    id: fallback.id,
    fileName: typeof v.fileName === "string" && v.fileName ? v.fileName : fallback.fileName,
    kind: v.kind === "image" ? "image" : "document",
    sizeBytes: typeof v.sizeBytes === "number" ? v.sizeBytes : fallback.sizeBytes,
    truncated: v.truncated === true,
  };
}

export async function uploadAttachment(input: UploadInput): Promise<AttachResult<UploadedAttachment>> {
  const f = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? defaultSleep;
  const maxWait = input.maxWaitMs ?? 60_000;

  input.onStage?.("uploading");
  const created = await callJson<{ attachmentId: string; uploadUrl: string; fileName?: string; kind?: string }>(f, "/api/attachments/upload-url", {
    method: "POST",
    body: { conversationId: input.conversationId, fileName: input.file.name, mimeType: input.mimeType, sizeBytes: input.file.size },
    signal: input.signal,
  });
  if (!created.ok) return created;
  const id = created.value.attachmentId;

  try {
    const put = await f(created.value.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: input.file,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!put.ok) return { ok: false, code: "UPLOAD_FAILED" };
  } catch {
    return { ok: false, code: "UPLOAD_FAILED" };
  }

  input.onStage?.("reading");
  const fallback = { id, fileName: input.file.name, sizeBytes: input.file.size };
  let view = await callJson<AttachmentView>(f, "/api/attachments/confirm", { method: "POST", body: { attachmentId: id }, signal: input.signal });
  if (!view.ok) return view;

  let waited = 0;
  let interval = 600;
  for (;;) {
    const v = view.value;
    if (v.status === "ready") return { ok: true, value: toUploaded(v, fallback) };
    if (v.status === "failed") return { ok: false, code: v.errorCode || "EXTRACT_FAILED" };
    if (input.signal?.aborted) return { ok: false, code: "NETWORK" };
    if (waited >= maxWait) return { ok: false, code: "TIMEOUT" };
    await sleep(interval, input.signal);
    waited += interval;
    interval = Math.min(Math.round(interval * 1.4), 3_000);
    view = await callJson<AttachmentView>(f, "/api/attachments/get", { method: "POST", body: { attachmentId: id }, signal: input.signal });
    if (!view.ok) return view;
  }
}
