"use client";

import * as React from "react";

import { fetchVoiceAvailable, transcribeRecording } from "../lib/voice-client";
import {
  initialVoiceState, isMicUnavailableCode, pickRecorderMime, voiceErrorKey, voiceReducer,
  VOICE_MAX_BYTES, VOICE_MAX_MS, VOICE_MIN_MS, type VoiceErrorKey, type VoicePhase,
} from "../lib/voice-recorder";

/**
 * apps/web/features/chat/hooks/use-voice-input.ts
 *
 * P6.3b. Owns everything impure about voice input: the permission prompt, MediaRecorder, the timer,
 * the network call. The decisions live in lib/voice-recorder.ts and lib/voice-client.ts (tested);
 * this file is glue, and is the part that needs a real browser to verify.
 *
 * Lifecycle: idle -> requesting (permission prompt) -> recording -> transcribing -> idle. The transcript
 * goes to `onTranscript` (the composer appends it, EDITABLE, never auto-sent). Every failure goes to
 * `onError` as a message key; nothing is retried, because transcribing is billed.
 *
 * The mic is offered only when (1) this browser has the flag (lib/voice-flag.ts), (2) the host says
 * speech input is configured (GET /api/voice/status), and (3) the caller wired a transcript target.
 * Until (2) is answered the mic is simply absent, never shown-then-removed.
 */
export interface UseVoiceInputOptions {
  /** False when the caller has nowhere to put a transcript: the hook stays inert. */
  enabled: boolean;
  language: "ar" | "en";
  onTranscript: (text: string) => void;
  onError: (key: VoiceErrorKey) => void;
}

export interface VoiceInput {
  /** The browser flag is on (and the caller is wired). The composer keeps its old placeholder when false. */
  flagOn: boolean;
  /** Flag on AND the host has a speech model: show the mic. */
  available: boolean;
  phase: VoicePhase;
  elapsedMs: number;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function useVoiceInput(opts: UseVoiceInputOptions): VoiceInput {
  const [state, dispatch] = React.useReducer(voiceReducer, initialVoiceState);
  const [flag, setFlag] = React.useState(false);
  const [available, setAvailable] = React.useState<boolean | null>(null);

  // Latest values for the long-lived callbacks (MediaRecorder handlers outlive a render).
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const optsRef = React.useRef(opts);
  optsRef.current = opts;

  const recRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const abortRef = React.useRef<AbortController | null>(null);
  const cancelledRef = React.useRef(false);
  const aliveRef = React.useRef(true);

  // P6.3d: `enabled` already carries the admin's switch (chat-view passes the transcript handler only when it is on).
  React.useEffect(() => {
    setFlag(opts.enabled);
  }, [opts.enabled]);

  React.useEffect(() => {
    if (!flag) return;
    const ctrl = new AbortController();
    void fetchVoiceAvailable(fetch, ctrl.signal).then((ok) => {
      if (!ctrl.signal.aborted) setAvailable(ok);
    });
    return () => ctrl.abort();
  }, [flag]);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearInterval(timerRef.current);
      abortRef.current?.abort();
      const rec = recRef.current;
      if (rec) {
        rec.onstop = null;
        rec.ondataavailable = null;
        if (rec.state !== "inactive") rec.stop();
      }
      stopTracks(streamRef.current);
    };
  }, []);

  const finishRecording = React.useCallback(async (mime: string) => {
    clearInterval(timerRef.current);
    stopTracks(streamRef.current);
    streamRef.current = null;
    recRef.current = null;
    const durationMs = performance.now() - startedAtRef.current;
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    const { onError, onTranscript, language } = optsRef.current;

    if (!aliveRef.current) return;
    if (cancelledRef.current) {
      dispatch({ type: "FINISH" });
      return;
    }
    if (durationMs < VOICE_MIN_MS || blob.size === 0) {
      dispatch({ type: "FINISH" });
      onError("voiceErrTooShort");
      return;
    }
    if (blob.size > VOICE_MAX_BYTES) {
      dispatch({ type: "FINISH" });
      onError("voiceErrTooLong");
      return;
    }

    dispatch({ type: "TRANSCRIBING" });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const result = await transcribeRecording({ blob, mimeType: mime, durationMs, language, signal: ctrl.signal });
    abortRef.current = null;
    if (!aliveRef.current || cancelledRef.current) {
      if (aliveRef.current) dispatch({ type: "FINISH" });
      return;
    }
    dispatch({ type: "FINISH" });
    if (result.ok) {
      onTranscript(result.value.text);
    } else {
      if (isMicUnavailableCode(result.code)) setAvailable(false);
      onError(voiceErrorKey(result.code));
    }
  }, []);

  const stop = React.useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const cancel = React.useCallback(() => {
    cancelledRef.current = true;
    if (stateRef.current.phase === "transcribing") {
      abortRef.current?.abort();
      return;
    }
    stop();
  }, [stop]);

  const start = React.useCallback(async () => {
    if (stateRef.current.phase !== "idle") return;
    const { onError } = optsRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("voiceErrUnsupported");
      return;
    }
    cancelledRef.current = false;
    dispatch({ type: "REQUEST" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (!aliveRef.current) return;
      dispatch({ type: "FINISH" });
      const name = (err as { name?: string } | null)?.name;
      onError(
        name === "NotAllowedError" || name === "SecurityError" ? "voiceErrPermission"
        : name === "NotFoundError" || name === "OverconstrainedError" ? "voiceErrNoMic"
        : "voiceErrGeneric",
      );
      return;
    }
    if (!aliveRef.current) {
      stopTracks(stream);
      return;
    }

    const preferred = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    let rec: MediaRecorder;
    try {
      rec = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
    } catch {
      stopTracks(stream);
      dispatch({ type: "FINISH" });
      onError("voiceErrUnsupported");
      return;
    }
    const mime = rec.mimeType || preferred || "audio/webm";
    streamRef.current = stream;
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => void finishRecording(mime);
    startedAtRef.current = performance.now();
    rec.start(1000);
    dispatch({ type: "RECORDING" });

    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current;
      dispatch({ type: "TICK", elapsedMs: elapsed });
      if (elapsed >= VOICE_MAX_MS) stop(); // the cap ends the recording and sends what was said
    }, 250);
  }, [finishRecording, stop]);

  return {
    flagOn: flag,
    available: flag && available === true,
    phase: state.phase,
    elapsedMs: state.elapsedMs,
    start: () => void start(),
    stop,
    cancel,
  };
}
