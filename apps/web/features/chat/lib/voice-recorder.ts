/**
 * apps/web/features/chat/lib/voice-recorder.ts
 *
 * P6.3b. Pure helpers for voice input: no MediaRecorder, no fetch, no React. The hook
 * (hooks/use-voice-input.ts) owns everything impure; this file owns the decisions that have tests.
 *
 * Limits mirror the server (apps/api/src/services/transcription.policy.ts, API_CONTRACT.md `voice`):
 * 5 minutes of audio and 15 MiB per voice note. The server stays the authority; these only stop the
 * client from recording something it already knows will be refused.
 */

export const VOICE_MAX_MS = 300_000;
/** A tap that records less than this is treated as accidental, never uploaded or billed. */
export const VOICE_MIN_MS = 600;
export const VOICE_MAX_BYTES = 15 * 1024 * 1024;

/** Types the server accepts (webm, ogg, mp4, mpeg, wav), most preferred first. Safari records mp4. */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** First candidate the browser can record, or null (then the browser's default type is used). */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  for (const m of RECORDER_MIME_CANDIDATES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      // A throwing isTypeSupported is the same as unsupported.
    }
  }
  return null;
}

/** "audio/webm;codecs=opus" -> "audio/webm". The PUT's Content-Type and the createUploadUrl mimeType. */
export function baseMime(mime: string): string {
  return (mime.split(";")[0] ?? "").trim().toLowerCase();
}

/** 12_000 -> "0:12", 65_400 -> "1:05". Never negative, never NaN. */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** What the person sees when something fails: a key under the `chat` messages namespace. */
export type VoiceErrorKey =
  | "voiceErrPermission"
  | "voiceErrNoMic"
  | "voiceErrUnsupported"
  | "voiceErrTooShort"
  | "voiceErrSilence"
  | "voiceErrBalance"
  | "voiceErrBusy"
  | "voiceErrTooLong"
  | "voiceErrUnusable"
  | "voiceErrUnavailable"
  | "voiceErrQuota"
  | "voiceErrNetwork"
  | "voiceErrGeneric";

/** Server codes (docs/frontend/API_CONTRACT.md `voice`) plus the client-side ones. Unknown -> generic. */
const ERROR_KEYS: Record<string, VoiceErrorKey> = {
  // client side
  PERMISSION_DENIED: "voiceErrPermission",
  NO_MICROPHONE: "voiceErrNoMic",
  UNSUPPORTED: "voiceErrUnsupported",
  TOO_SHORT: "voiceErrTooShort",
  SILENCE: "voiceErrSilence",
  NETWORK: "voiceErrNetwork",
  UPLOAD_FAILED: "voiceErrNetwork",
  // voice.createUploadUrl / confirm
  INVALID_MIME: "voiceErrUnsupported",
  UNSUPPORTED_MEDIA_TYPE: "voiceErrUnsupported",
  FILE_TOO_LARGE: "voiceErrTooLong",
  PAYLOAD_TOO_LARGE: "voiceErrTooLong",
  QUOTA_DAILY: "voiceErrQuota",
  QUOTA_BYTES: "voiceErrQuota",
  TOO_MANY_REQUESTS: "voiceErrQuota",
  OBJECT_NOT_FOUND: "voiceErrNetwork",
  // voice.transcribe
  INSUFFICIENT_BALANCE: "voiceErrBalance",
  REQUEST_IN_PROGRESS: "voiceErrBusy",
  BILLING_LOCK_UNAVAILABLE: "voiceErrUnavailable",
  AUDIO_NOT_FOUND: "voiceErrNetwork",
  AUDIO_TOO_LONG: "voiceErrTooLong",
  AUDIO_UNUSABLE: "voiceErrUnusable",
  TRANSCRIPTION_UNAVAILABLE: "voiceErrUnavailable",
  TRANSCRIPTION_FAILED: "voiceErrUnavailable",
  TRANSCRIPTION_NOT_CONFIGURED: "voiceErrUnavailable",
  STORAGE_DISABLED: "voiceErrUnavailable",
  UPSTREAM: "voiceErrUnavailable",
  UPSTREAM_UNREACHABLE: "voiceErrUnavailable",
  UNAUTHORIZED: "voiceErrGeneric",
};

export function voiceErrorKey(code: string): VoiceErrorKey {
  return ERROR_KEYS[code] ?? "voiceErrGeneric";
}

/** Codes after which the mic should disappear for this session (nothing the person can fix by retrying). */
export function isMicUnavailableCode(code: string): boolean {
  return code === "TRANSCRIPTION_NOT_CONFIGURED" || code === "STORAGE_DISABLED";
}

export type VoicePhase = "idle" | "requesting" | "recording" | "transcribing";

export type VoiceAction =
  | { type: "REQUEST" }
  | { type: "RECORDING" }
  | { type: "TRANSCRIBING" }
  | { type: "FINISH" } // back to idle, success or failure alike
  | { type: "TICK"; elapsedMs: number };

export interface VoiceState {
  phase: VoicePhase;
  elapsedMs: number;
}

export const initialVoiceState: VoiceState = { phase: "idle", elapsedMs: 0 };

/** Only legal transitions apply; a late event from a finished recording is ignored. */
export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case "REQUEST":
      return state.phase === "idle" ? { phase: "requesting", elapsedMs: 0 } : state;
    case "RECORDING":
      return state.phase === "requesting" ? { phase: "recording", elapsedMs: 0 } : state;
    case "TICK":
      return state.phase === "recording" ? { ...state, elapsedMs: Math.min(Math.max(0, action.elapsedMs), VOICE_MAX_MS) } : state;
    case "TRANSCRIBING":
      return state.phase === "recording" ? { ...state, phase: "transcribing" } : state;
    case "FINISH":
      return initialVoiceState;
    default:
      return state;
  }
}

/** Joins a transcript onto what is already in the composer: one space, nothing doubled. */
export function appendTranscript(draft: string, text: string): string {
  const t = text.trim();
  if (!t) return draft;
  const d = draft.trimEnd();
  return d ? `${d} ${t}` : t;
}
