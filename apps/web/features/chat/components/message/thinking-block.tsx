"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ThinkingTrace } from "../../types";

export interface ThinkingBlockProps {
  trace: ThinkingTrace;
  /** True while the model is still reasoning: this is the message being streamed
   *  and no answer text has arrived yet. Drives the open state, the light
   *  animations and the live seconds counter. */
  live: boolean;
  className?: string | undefined;
}

/**
 * apps/web/features/chat/components/message/thinking-block.tsx
 *
 * P6.3a. The collapsible "Thinking" block above an assistant answer (v2 stream
 * only, behind the per-browser flag in lib/stream-mode.ts).
 *
 * DESIGN ("the gate ajar"). The app's identity is the Gateway: a warm base and
 * one amber "gate" light. The model's reasoning is what happens behind that
 * gate, so it is drawn as a quiet hairline in the gate colour running down the
 * inline-start edge of the text. While the model is reasoning, a band of light
 * travels down that hairline, a small aperture glyph has a dot circling it, and
 * the label carries one pass of light. That living thread is the one memorable
 * thing here; everything else is deliberately plain: muted type, no card, no
 * shadow, no background fill. When the answer starts, the block closes on its
 * own to one line ("Thought for 8s"), the light stops, and the glyph's dot
 * comes to rest at the top.
 *
 * BEHAVIOUR
 *  - Open while reasoning, collapsed once the answer starts. The person's own
 *    tap always wins: once toggled, the block stays as they left it.
 *  - While live, the text is a short window pinned to the newest reasoning,
 *    with older lines dissolving at the top (only when it actually overflows).
 *    Afterwards, opened by hand, it is a normal scroll area.
 *  - Reasoning is shown as plain text (`whitespace-pre-wrap`), not markdown: it
 *    is model output nobody asked to be formatted, and it re-renders on every
 *    frame while streaming. `dir="auto"` lets an English reasoning trace sit
 *    left and an Arabic one right, whatever the page direction is.
 *  - Logical properties only (ms/ps/start/border-s): RTL needs no special case.
 *    Every animation is `motion-safe:`; the open/close transition is
 *    `motion-reduce:transition-none`.
 */

function ApertureGlyph({ live }: { live: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4 shrink-0 text-primary">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" strokeOpacity={live ? 0.35 : 0.55} />
      <g
        className={cn("[transform-origin:8px_8px]", live && "motion-safe:animate-thinking-orbit")}
      >
        <circle cx="8" cy="1.75" r="1.4" fill="currentColor" />
      </g>
    </svg>
  );
}

export function ThinkingBlock({ trace, live, className }: ThinkingBlockProps) {
  const t = useTranslations("chat");
  const bodyId = React.useId();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // null = the person has not touched it, so the default (open while live) applies.
  const [userOpen, setUserOpen] = React.useState<boolean | null>(null);
  const open = userOpen ?? live;

  // Seconds counter: one tick per second, only while reasoning.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  // Pin the window to the newest reasoning while it streams, and only fade the
  // top edge when there is actually older text scrolled out of view.
  const [fadeTop, setFadeTop] = React.useState(false);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (live) el.scrollTop = el.scrollHeight;
    setFadeTop(live && el.scrollHeight > el.clientHeight + 1);
  }, [live, open, trace.text]);

  const endedAt = trace.endedAt ?? (live ? now : undefined);
  const seconds =
    endedAt === undefined ? undefined : Math.max(1, Math.round((endedAt - trace.startedAt) / 1000));

  const label = live
    ? t("thinkingLive")
    : seconds === undefined
      ? t("thinkingDoneNoTime")
      : t("thinkingDone", { seconds });

  return (
    <section className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="-ms-1 flex min-h-9 max-w-full items-center gap-2 rounded-lg px-1 py-1 text-start text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ApertureGlyph live={live} />
        <span
          className={cn(
            "truncate",
            live &&
              "bg-[linear-gradient(90deg,var(--muted-foreground)_0%,var(--muted-foreground)_38%,var(--primary)_50%,var(--muted-foreground)_62%,var(--muted-foreground)_100%)] bg-[length:250%_100%] bg-clip-text text-transparent motion-safe:animate-thinking-sheen",
          )}
        >
          {label}
        </span>
        {live && seconds !== undefined && (
          <span className="shrink-0 text-[12px] font-normal tabular-nums text-faint-foreground">
            {t("thinkingSeconds", { seconds })}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-faint-foreground transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {/* grid-rows 0fr -> 1fr animates height without measuring it. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative ms-[7px] mt-1 mb-1 ps-4">
            <span
              aria-hidden="true"
              className="absolute inset-y-0 start-0 w-px overflow-hidden rounded-full bg-primary/25"
            >
              {live && (
                <span className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--primary),transparent)] bg-[length:100%_40%] bg-no-repeat motion-safe:animate-thinking-thread" />
              )}
            </span>
            <div
              id={bodyId}
              ref={scrollRef}
              dir="auto"
              role="region"
              aria-label={t("thinkingRegion")}
              aria-hidden={!open}
              tabIndex={open ? 0 : -1}
              className={cn(
                "overflow-y-auto overscroll-contain whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-start text-[13.5px] leading-[1.75] text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                live ? "max-h-28" : "max-h-80",
                fadeTop && "[mask-image:linear-gradient(to_bottom,transparent,black_1.75rem)]",
              )}
            >
              {trace.text.trimStart()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
