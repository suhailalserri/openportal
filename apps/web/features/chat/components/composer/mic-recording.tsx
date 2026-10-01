"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatClock } from "../../lib/voice-recorder";

/**
 * apps/web/features/chat/components/composer/mic-recording.tsx
 *
 * P6.3b. The recording strip, ported from the owner's component catalog (Elements2.html, "12 · Mic
 * Recording"): a pulsing red dot, a mono timer, twelve level bars and a filled red stop circle with a
 * square. Two additions the catalog does not draw: a small cancel (discard without sending, nothing is
 * billed) and the transcribing state, which keeps the same row so the composer does not jump.
 *
 * The bars are decorative (a fixed pattern, as in the catalog), not a live level meter: honest about
 * being "recording", with no AudioContext to keep alive. All motion is `motion-safe:`; with reduced
 * motion the dot and bars simply hold still. The timer is not announced each second (it is
 * `aria-hidden`); the row's own status text is, once.
 */
const BAR_HEIGHTS = [8, 14, 10, 20, 16, 22, 14, 18, 10, 16, 8, 20] as const;
const BAR_DELAYS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0, 0.15] as const;

export interface MicRecordingProps {
  phase: "recording" | "transcribing";
  elapsedMs: number;
  onStop: () => void;
  onCancel: () => void;
  className?: string | undefined;
}

export function MicRecording({ phase, elapsedMs, onStop, onCancel, className }: MicRecordingProps) {
  const t = useTranslations("chat");

  if (phase === "transcribing") {
    return (
      <div role="status" className={cn("flex min-h-11 items-center gap-3 px-1 py-0.5", className)}>
        <Loader2 aria-hidden className="size-4 shrink-0 text-primary motion-safe:animate-spin" />
        <span className="flex-1 text-[13.5px] text-muted-foreground">{t("micTranscribing")}</span>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("micCancel")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-faint-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div role="group" aria-label={t("micRecording")} className={cn("flex min-h-11 items-center gap-3 px-1 py-0.5", className)}>
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full bg-destructive motion-safe:animate-rec-pulse"
      />
      <span
        aria-hidden
        dir="ltr"
        className="min-w-11 font-mono text-sm font-medium tabular-nums text-destructive"
      >
        {formatClock(elapsedMs)}
      </span>
      <div aria-hidden className="flex h-7 flex-1 items-center justify-center gap-0.5 px-2">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="w-0.5 origin-center rounded-full bg-destructive motion-safe:animate-rec-bar"
            style={{ height: h, animationDelay: `${BAR_DELAYS[i]}s` }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t("micCancel")}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-faint-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={onStop}
        aria-label={t("micStop")}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground outline-none transition-[filter,transform] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      </button>
    </div>
  );
}
