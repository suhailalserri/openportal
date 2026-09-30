/**
 * P5.3: pure transcription rules (no I/O, no package imports, so it runs anywhere).
 *
 * PRICING UNIT (deliberate, see docs/runbooks/VOICE.md): a transcription model is a `models` row
 * whose `categories` contains "transcription". Its `wholesaleCostInputPerM` means
 * **USD per 1,000,000 AUDIO SECONDS** (same "per 1M units" shape as tokens, unit = one second).
 * whisper-1 at $0.006/min = $0.0001/s = 100. `wholesaleCostOutputPerM` is ignored.
 *
 * WHAT IS BILLED: the provider's reported duration when it reports one; otherwise our own
 * estimate, which can only go UP from what the client declared (see resolveBillableSeconds).
 * The transcript text is never billed per token: the audio is the cost.
 */

export const TRANSCRIPTION_CATEGORY = "transcription";

const MiB = 1024 * 1024;

export const TRANSCRIPTION_LIMITS = {
  /** Recording cap. Bounds the cost of one call and of a forgotten open mic. */
  maxDurationSeconds: 300,
  /** Upload cap for voice notes (the audio bucket itself allows 25 MiB). */
  maxBytes:           15 * MiB,
  /** Billing floor: a call is never billed for less than this. */
  minBillableSeconds: 1,
  /** Upper bound of plausible compressed bitrate: 8 kbps. Used to cap a client-declared duration. */
  minBytesPerSecond:  1_000,
  /** Lowest per-1M-audio-seconds price we accept (about $0.0003/min). Below this the row was almost
   *  certainly filled in as a token price; we refuse rather than sell transcription near-free. */
  minPricePerMillionSeconds: 5,
  /** Provider call timeout. */
  providerTimeoutMs:  60_000,
  /** Transcript cap returned to the composer. */
  maxTranscriptChars: 20_000,
  /** Voice notes per user per day (audio bucket only; attachments keep their own cap). */
  maxUploadsPerDay:   100,
} as const;

export type TranscriptionErrorCode =
  | "TRANSCRIPTION_NOT_CONFIGURED" // no usable model row / price, or storage disabled
  | "AUDIO_NOT_FOUND"              // missing, foreign, unconfirmed or already deleted (indistinguishable)
  | "AUDIO_TOO_LONG"
  | "AUDIO_UNUSABLE"               // provider says the file cannot be decoded (object is discarded)
  | "INSUFFICIENT_BALANCE"
  | "TRANSCRIPTION_UNAVAILABLE"    // provider/gateway down or rate-limited: retry, nothing billed
  | "TRANSCRIPTION_FAILED";        // unexpected provider answer

export class TranscriptionError extends Error {
  constructor(public readonly code: TranscriptionErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TranscriptionError";
  }
}

/** Highest plausible bytes/second for a mime: a file can be SHORTER than bytes/this, never longer. */
function maxBytesPerSecond(mime: string): number {
  switch (mime) {
    case "audio/wav":  return 192_000; // 48 kHz, 16-bit, stereo
    case "audio/mpeg": return 40_000;  // 320 kbps
    default:           return 16_000;  // 128 kbps opus/aac/vorbis
  }
}

/** Shortest duration this many bytes can plausibly hold. Anti under-declaration floor. */
export function durationFloorSeconds(sizeBytes: number, mime: string): number {
  return sizeBytes / maxBytesPerSecond(mime);
}

/** Longest duration this many bytes can plausibly hold (8 kbps). Caps a wildly inflated declaration. */
export function durationCeilingSeconds(sizeBytes: number): number {
  return sizeBytes / TRANSCRIPTION_LIMITS.minBytesPerSecond;
}

export interface DurationInputs {
  sizeBytes:       number;
  mime:            string;
  /** Client-declared duration in ms (MediaRecorder timing). Untrusted; may be absent. */
  declaredMs?:     number | null;
}

/**
 * Pre-flight duration estimate in seconds, used for the affordability gate. Conservative:
 * never below the byte-size floor, never below what the client declared.
 * Throws AUDIO_TOO_LONG when even the most favourable reading exceeds the recording cap.
 */
export function estimateSeconds(i: DurationInputs): number {
  const floor    = durationFloorSeconds(i.sizeBytes, i.mime);
  const declared = i.declaredMs != null && Number.isFinite(i.declaredMs) && i.declaredMs > 0 ? i.declaredMs / 1000 : 0;
  if (declared > TRANSCRIPTION_LIMITS.maxDurationSeconds || floor > TRANSCRIPTION_LIMITS.maxDurationSeconds) {
    throw new TranscriptionError("AUDIO_TOO_LONG");
  }
  const ceiling = durationCeilingSeconds(i.sizeBytes);
  const est = Math.max(floor, Math.min(declared || floor, ceiling));
  return Math.max(est, TRANSCRIPTION_LIMITS.minBillableSeconds);
}

/**
 * Final billable whole seconds. Provider-reported duration wins (it is the real cost driver);
 * without it we bill our estimate. Always rounded UP, never below the billing floor.
 */
export function resolveBillableSeconds(providerSeconds: number | null | undefined, estimatedSeconds: number): number {
  const base = providerSeconds != null && Number.isFinite(providerSeconds) && providerSeconds > 0
    ? providerSeconds
    : estimatedSeconds;
  return Math.max(Math.ceil(base), TRANSCRIPTION_LIMITS.minBillableSeconds);
}

export interface TranscriptionPricing { perMillionSeconds: number; markup: number }

/** null = price is not usable (unset, NaN, or implausibly low: probably a token price). */
export function readPricing(row: { wholesaleCostInputPerM: string | number; markupMultiplier: string | number }): TranscriptionPricing | null {
  const perMillionSeconds = Number(row.wholesaleCostInputPerM);
  const markup = Number(row.markupMultiplier);
  if (!Number.isFinite(perMillionSeconds) || perMillionSeconds < TRANSCRIPTION_LIMITS.minPricePerMillionSeconds) return null;
  if (!Number.isFinite(markup) || markup <= 0) return null;
  return { perMillionSeconds, markup };
}

/** Micro-credits for `seconds` of audio. Rounded UP, minimum 1 (same rule as calcCreditCost). */
export function transcriptionCostMicro(p: TranscriptionPricing, seconds: number, creditValueUsd: number): number {
  // micro-credits = seconds * (USD per 1M s) * markup / (USD per credit): the two 1e6 factors cancel.
  // toFixed snaps float noise (8600000.000000001) so ceil cannot bill one micro-credit too many.
  const raw = (seconds * p.perMillionSeconds * p.markup) / creditValueUsd;
  return Math.max(Math.ceil(Number(raw.toFixed(6))), 1);
}

export interface ParsedTranscription { text: string; seconds: number | null }

/**
 * OpenAI-style answer. `json` returns { text, usage?: { type: "duration", seconds } | { type: "tokens", ... } };
 * `verbose_json` returns { text, duration }. Token-typed usage carries no seconds: we fall back to
 * our estimate. null = not a usable answer.
 */
export function parseTranscriptionResponse(body: unknown): ParsedTranscription | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string") return null;
  let seconds: number | null = null;
  const usage = b.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object" && usage.type === "duration" && typeof usage.seconds === "number") {
    seconds = usage.seconds;
  } else if (typeof b.duration === "number") {
    seconds = b.duration;
  }
  if (seconds !== null && !(Number.isFinite(seconds) && seconds > 0)) seconds = null;
  return { text: cleanTranscript(b.text), seconds };
}

/** Strip control characters (keep newline/tab), trim, cap. */
export function cleanTranscript(text: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned.length > TRANSCRIPTION_LIMITS.maxTranscriptChars
    ? cleaned.slice(0, TRANSCRIPTION_LIMITS.maxTranscriptChars)
    : cleaned;
}

const EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav",
};
/** File name the provider uses to sniff the container. */
export function audioFileName(mime: string): string {
  return `audio.${EXT[mime] ?? "webm"}`;
}

/** Optional ISO-639-1 hint ("ar", "en"); anything else is dropped rather than forwarded. */
export function normalizeLanguage(lang: string | undefined | null): string | undefined {
  if (!lang) return undefined;
  const l = lang.trim().toLowerCase();
  return /^[a-z]{2}$/.test(l) ? l : undefined;
}

export type UpstreamVerdict = "unavailable" | "unusable";
/** Maps a gateway HTTP status to what we do next. */
export function classifyUpstreamStatus(status: number): UpstreamVerdict {
  // The file itself is bad: retrying the same bytes cannot help.
  if (status === 400 || status === 413 || status === 415 || status === 422) return "unusable";
  // 401/403/404 (channel or model not served), 429, 5xx: our side or theirs, not the user's file.
  return "unavailable";
}
