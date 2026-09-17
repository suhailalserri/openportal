"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { TriangleAlert, Square, SendHorizontal, Mic, MicOff, Plus } from "lucide-react";
import { TokenCounter } from "./TokenCounter";
import { ModelSelector } from "./ModelSelector";

interface InputBarProps {
  onSubmit:  (text: string) => void;
  onStop?:   () => void;
  isLoading: boolean;
  disabled:  boolean;
  modelId:   string;
  onModelChange: (modelId: string) => void;
  locale:    string;
  offline?:  boolean;
}

// Minimal shape of the Web Speech API — not part of the standard lib.dom
// types this project ships with, so declared locally rather than pulling
// in an extra @types package for a handful of fields.
interface SpeechRecognitionResultLike { 0: { transcript: string }; isFinal: boolean }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function InputBar({ onSubmit, onStop, isLoading, disabled, modelId, onModelChange, locale, offline }: InputBarProps) {
  const t             = useTranslations();
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [isOverLimit, setIsOverLimit] = useState(false);
  const isRTL         = locale === "ar";
  const isBlocked     = disabled || !!offline;

  const handleOverLimitChange = useCallback((v: boolean) => setIsOverLimit(v), []);

  // BUG FIX: `isLoading` is React state, which is async/batched — two Enter
  // keydowns landing in the same tick (a well-documented quirk on Android
  // soft keyboards, which can fire two keydown events for one tap of the
  // send glyph) both read the same stale `isLoading = false` and both call
  // onSubmit, producing the duplicate user bubble. A synchronous ref isn't
  // subject to React's batching, so the second call in the same tick sees
  // the lock the first call just set and bails out immediately.
  const sendingRef = useRef(false);
  useEffect(() => { if (!isLoading) sendingRef.current = false; }, [isLoading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  // ── Voice input — browser-native Web Speech API ──────────────────────
  // No backend involved at all: the browser itself transcribes speech to
  // text and hands back plain text, which is appended into the same
  // textarea state the keyboard would fill. There is no speech-to-text
  // endpoint anywhere in this codebase, so this is scoped strictly to
  // what the browser can already do on its own — feature-detected, and
  // the mic button disables itself with an explanatory tooltip wherever
  // the API doesn't exist (Firefox, most in-app webviews).
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => { setSpeechSupported(!!getSpeechRecognitionCtor()); }, []);

  function toggleRecording() {
    if (isBlocked || isLoading) return;
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) { toast.info(t("chat.recordUnsupported")); return; }

    const recognition = new Ctor();
    recognition.lang = isRTL ? "ar-SA" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    // Track a running "committed" base so interim results replace only
    // the tail of the text instead of appending duplicates on every
    // partial update, and so it composes cleanly with whatever the user
    // had already typed before pressing the mic.
    let base = text ? `${text} ` : "";

    recognition.onresult = (e) => {
      let finalChunk = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) finalChunk += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalChunk) base += `${finalChunk} `;
      setText((base + interim).trimStart());
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  }

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ignore Enter while an IME composition is in progress (e.g. typing
    // Arabic/CJK, or the composition-end event some Android keyboards emit
    // right before the "real" Enter) — otherwise this fires mid-composition
    // on top of the real keydown.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  // Bumped on every successful send purely to remount the send icon so
  // its "launch" keyframe (globals.css) replays from frame zero each
  // time, instead of only ever playing once.
  const [launchTick, setLaunchTick] = useState(0);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isLoading || isBlocked || isOverLimit || sendingRef.current) return;
    if (isRecording) recognitionRef.current?.stop();
    sendingRef.current = true;
    setLaunchTick(n => n + 1);
    onSubmit(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  const placeholder = offline
    ? t("chat.offline")
    : disabled
      ? t("balance.zeroMessage")
      : t("chat.placeholder");

  return (
    <div className="border-t border-slate-800 bg-[color:var(--bg-surface)] px-3 pt-2.5 pb-3 sm:px-4">
      {isOverLimit && (
        <p className="flex items-center justify-center gap-1.5 text-red-400 text-xs mb-2 text-center animate-fade-in">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t("chat.contextExceeded")}
        </p>
      )}

      {/* Live cost estimate — its own thin row above the composer so it
          has the full width to itself on a phone, rather than fighting
          the toolbar's icon row for space. Only takes up room once the
          user has actually typed something to estimate. TokenCounter
          stays mounted (just visually hidden) while over the limit so
          its over-limit effect keeps firing and the warning above stays
          accurate. */}
      {text && (
        <div className={isOverLimit ? "hidden" : "flex mb-1.5 animate-fade-in"} dir={isRTL ? "rtl" : "ltr"}>
          <TokenCounter text={text} modelId={modelId} locale={locale} onOverLimitChange={handleOverLimitChange} />
        </div>
      )}

      {/* Composer — quiet elevated surface, accent ring only on focus.
          Structurally this sits outside the scrollable message area (see
          chat/page.tsx), so it's already pinned to the bottom of the
          viewport regardless of scroll position — no position:fixed
          needed, which would otherwise fight the on-screen keyboard on
          mobile. */}
      <div className="flex flex-col gap-2 bg-[color:var(--bg-base)] rounded-2xl border border-slate-700
                      shadow-[var(--shadow-elevation-1)]
                      focus-within:border-[color:var(--accent-blue)] focus-within:shadow-[var(--shadow-glow-blue)]
                      transition-all duration-200 p-2.5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBlocked || isLoading}
          rows={1}
          dir={isRTL ? "rtl" : "ltr"}
          className="w-full bg-transparent resize-none text-slate-50 placeholder-slate-500
                     focus:outline-none text-sm leading-relaxed min-h-[24px] max-h-[200px] px-1.5 pt-1
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Toolbar — everything about *how* the message will be sent
            (which model, attach, voice) lives on one row directly under
            the text, with send anchored at the trailing edge. */}
        <div className="flex items-center gap-1">
          {/* Attach — genuinely disabled, not a fake affordance. There is
              no file-upload endpoint anywhere in this API yet, so this
              button says so plainly instead of pretending to accept a
              file that would go nowhere. */}
          <button
            type="button"
            onClick={() => toast.info(t("chat.attachComingSoon"))}
            aria-label={t("chat.attach")}
            title={t("chat.attachComingSoon")}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[color:var(--bg-elevated)]
                       transition-colors shrink-0 active:scale-95 opacity-60 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-800 mx-0.5 shrink-0" aria-hidden="true" />

          <ModelSelector value={modelId} onChange={onModelChange} compact />

          <div className="flex-1" />

          {/* Voice input — real browser speech-to-text, feature-detected;
              quietly disabled with an explanatory tooltip where the
              browser doesn't support it, rather than shown as broken. */}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isBlocked || isLoading || !speechSupported}
            aria-label={isRecording ? t("chat.recordStop") : t("chat.record")}
            title={speechSupported ? (isRecording ? t("chat.recordStop") : t("chat.record")) : t("chat.recordUnsupported")}
            className={`relative p-2 rounded-lg transition-colors shrink-0 active:scale-95
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
                       ${isRecording
                         ? "text-red-400 bg-red-950/30 animate-mic-pulse"
                         : "text-slate-500 hover:text-slate-300 hover:bg-[color:var(--bg-elevated)]"}`}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {isLoading ? (
            <button onClick={onStop} aria-label={t("chat.stop")}
              className="p-2.5 bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl text-white
                         transition-all flex-shrink-0">
              <Square className="w-4 h-4" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              aria-label={t("chat.send")}
              disabled={!text.trim() || isBlocked || isOverLimit}
              className="relative p-2.5 bg-[color:var(--accent-blue)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed
                         active:scale-95 disabled:active:scale-100
                         rounded-xl text-white transition-all flex-shrink-0
                         shadow-[var(--shadow-elevation-1)] overflow-visible"
            >
              {/* Expanding ring "launch" pulse — purely decorative,
                  remounted via key so it replays on every send. */}
              <span key={`ring-${launchTick}`} aria-hidden
                className={launchTick > 0 ? "absolute inset-0 rounded-xl animate-send-ring pointer-events-none" : "hidden"} />
              <SendHorizontal
                key={`icon-${launchTick}`}
                className={`w-4 h-4 relative ${launchTick > 0 ? (isRTL ? "animate-send-fly-rtl" : "animate-send-fly-ltr") : ""}`}
                style={{ transform: isRTL ? "scaleX(-1)" : "none" }}
              />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-600 text-center mt-2">
        {t("chat.disclaimer")}
      </p>
    </div>
  );
}
