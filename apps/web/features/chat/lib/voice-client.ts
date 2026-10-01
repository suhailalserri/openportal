import { baseMime } from "./voice-recorder";

/**
 * apps/web/features/chat/lib/voice-client.ts
 *
 * P6.3b. The network half of voice input, as plain functions over an injectable `fetch` (so the tests
 * need no browser):
 *
 *   POST /api/voice/upload-url  -> { audioId, uploadUrl }
 *   PUT  uploadUrl              (the recording, straight to storage; never through our servers)
 *   POST /api/voice/confirm
 *   POST /api/voice/transcribe  -> { text, ... }       (BILLED; the server deletes the recording)
 *
 * Every failure is reported as a stable CODE (never a message string to show): the UI maps codes to
 * copy (voice-recorder.ts voiceErrorKey). Nothing here retries a billed call: a retry of `transcribe`
 * is the person's decision, because the server bills a transcription it completes.
 */

export type VoiceResult<T> = { ok: true; value: T } | { ok: false; code: string };

type FetchLike = typeof fetch;

async function readCode(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === "string" && /^[A-Z][A-Z0-9_]{2,60}$/.test(j.error)) return j.error;
  } catch {
    // not JSON (a platform error page): fall through
  }
  return res.status === 401 ? "UNAUTHORIZED" : "UNKNOWN";
}

export async function callJson<T>(
  fetchImpl: FetchLike,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal | undefined },
): Promise<VoiceResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(path, {
      method: init.method,
      ...(init.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch {
    return { ok: false, code: "NETWORK" };
  }
  if (!res.ok) return { ok: false, code: await readCode(res) };
  try {
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
}

/** Whether to show the mic at all. Any failure means "no": the mic never shows on a guess. */
export async function fetchVoiceAvailable(fetchImpl: FetchLike = fetch, signal?: AbortSignal): Promise<boolean> {
  const r = await callJson<{ available?: unknown }>(fetchImpl, "/api/voice/status", { method: "GET", signal });
  return r.ok && r.value.available === true;
}

export interface TranscribeInput {
  blob: Blob;
  /** The recorder's mime type, parameters allowed (audio/webm;codecs=opus). */
  mimeType: string;
  /** MediaRecorder timing. The server may only raise its own estimate with it, never lower the bill. */
  durationMs: number;
  /** Two-letter hint ("ar", "en"). */
  language?: string | undefined;
  signal?: AbortSignal | undefined;
  fetchImpl?: FetchLike | undefined;
}

export interface Transcription {
  text: string;
  creditsCharged: number | undefined;
}

export async function transcribeRecording(input: TranscribeInput): Promise<VoiceResult<Transcription>> {
  const f = input.fetchImpl ?? fetch;
  const mime = baseMime(input.mimeType);

  const created = await callJson<{ audioId: string; uploadUrl: string }>(f, "/api/voice/upload-url", {
    method: "POST",
    body: { mimeType: mime, sizeBytes: input.blob.size },
    signal: input.signal,
  });
  if (!created.ok) return created;

  try {
    const put = await f(created.value.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: input.blob,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!put.ok) return { ok: false, code: "UPLOAD_FAILED" };
  } catch {
    return { ok: false, code: "UPLOAD_FAILED" };
  }

  const confirmed = await callJson<unknown>(f, "/api/voice/confirm", {
    method: "POST",
    body: { audioId: created.value.audioId },
    signal: input.signal,
  });
  if (!confirmed.ok) return confirmed;

  const done = await callJson<{ text?: unknown; creditsCharged?: unknown }>(f, "/api/voice/transcribe", {
    method: "POST",
    body: {
      audioId: created.value.audioId,
      durationMs: Math.max(1, Math.round(input.durationMs)),
      ...(input.language ? { language: input.language } : {}),
    },
    signal: input.signal,
  });
  if (!done.ok) return done;

  const text = typeof done.value.text === "string" ? done.value.text.trim() : "";
  if (!text) return { ok: false, code: "SILENCE" }; // the server says silence with an empty text, and bills it
  return {
    ok: true,
    value: {
      text,
      creditsCharged: typeof done.value.creditsCharged === "number" ? done.value.creditsCharged : undefined,
    },
  };
}
