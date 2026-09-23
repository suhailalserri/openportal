"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Android } from "@/components/magicui/android";
import { Iphone } from "@/components/magicui/iphone";
import { Safari } from "@/components/magicui/safari";
import { cn } from "@/lib/utils";
import type { DemoContent, DemoScenario, DemoVariant } from "@/features/landing/lib/demo-content";
import { balanceMarkdown, chunkForStream, delayAfter } from "@/features/landing/lib/stream-demo";

/**
 * apps/web/features/landing/components/demo-section.tsx
 *
 * Phase 3.3, redesigned this session to preview the same chat
 * simulation across three devices (desktop Safari / iPhone / Android).
 *
 * WHAT CHANGED AND WHY:
 *  - Three device frames (components/magicui/{safari,iphone,android}.tsx)
 *    swap in place of the single chat card that used to sit here. The
 *    toggle above picks one; each frame wraps the SAME <ChatBody>, so
 *    the content is identical across devices and only the chrome moves.
 *  - The simulation is staged in FOUR phases (idle -> user -> thinking
 *    -> streaming -> done), so a visitor sees the exchange build up the
 *    way a real chat does: user bubble slides in, then a three-dot
 *    indicator, then the reply streams token by token, then the usage
 *    line (input/output tokens + total cost) fades in. The previous
 *    version showed the prompt bubble immediately and started streaming
 *    almost at once.
 *  - Streaming speed is slower than MagicUI's default (~45 ms per token
 *    rather than 34) and the pause before streaming starts is longer
 *    (~1 s thinking), and the user bubble now sits alone for ~1.2 s
 *    before the thinking indicator appears — the request was explicitly
 *    "very normal speed", not a quick demo flash.
 *  - BorderBeam was dropped from this section: the device frame is now
 *    the visual focus, and a rotating beam clipped by an iPhone's 34px
 *    screen radius would look wrong. The beam still runs on the
 *    calculator and packages sections.
 *  - Phase changes drive CSS transitions on the bubbles (opacity +
 *    translate-y). On device swap the ChatBody remounts, but because
 *    the phase lives in the parent, every bubble appears at its CURRENT
 *    state instantly — no flash of "hidden then re-animated". The
 *    entrance animation only plays when the phase actually changes.
 *
 * TEXT SIZING (this session): the bubble / usage text is deliberately
 * smaller than a real chat UI (11.5 px and 10 px) because it is rendered
 * INSIDE a 280 px device frame — 13.5 px read as oversized inside an
 * iPhone silhouette and the bubbles wrapped awkwardly. The markdown
 * blocks (lists, code fences) were tightened to match. If the frame
 * widths in iphone.tsx / android.tsx ever grow, these sizes are the
 * first thing to revisit.
 *
 * RULE 1: nothing here is money maths. `variant.inputTokens`,
 * `variant.outputTokens`, `variant.costYer` all arrive pre-formatted
 * from the demo JSON (see demo-content.ts); this file prints them.
 *
 * Reduced motion: the reduced-motion branch of the effect skips the
 * staging entirely and shows the finished reply + usage line at once.
 * `theme.css`'s global `animation-duration` override handles the CSS
 * bouncing dots and streaming cursor on top of that.
 *
 * PLACEMENT NOTE: this section is mounted SECOND on the landing page
 * (right after the hero — see index.tsx), not last. A chat demo is
 * self-explanatory evidence and answers "what is this?" better than any
 * paragraph; it should be seen before any numbers.
 */

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 ps-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 ps-4">{children}</ol>,
  li: ({ children }) => <li className="ps-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children }) => {
    // Fenced code blocks (```lang) get a `language-*` className from
    // remark-gfm; inline `code` spans don't. Only fenced blocks get the
    // dedicated code-block treatment (own background, scroll, LTR block);
    // inline code stays a small inline chip.
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code dir="ltr" className={cn("block font-mono text-[0.85em] leading-relaxed", className)}>
          {children}
        </code>
      );
    }
    return (
      <code dir="ltr" className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre dir="ltr" className="my-1.5 overflow-x-auto rounded-[8px] bg-muted p-2 text-start text-[0.85em]">
      {children}
    </pre>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
};

type Phase = "idle" | "user" | "thinking" | "streaming" | "done";
type Device = "desktop" | "iphone" | "android";

const DEVICES: readonly { id: Device; Icon: typeof Monitor }[] = [
  { id: "desktop", Icon: Monitor },
  { id: "iphone", Icon: Smartphone },
  { id: "android", Icon: Smartphone },
];

/** How long the user bubble sits alone before the thinking dots appear. */
const USER_BUBBLE_MS = 1200;
/** How long the three-dot indicator shows before streaming starts. */
const THINKING_MS = 1000;
/** Per-token delay passed to delayAfter (its own default is 34). */
const STREAM_BASE_MS = 45;

export function DemoSection({ locale, content }: { locale: string; content: DemoContent }) {
  const t = useTranslations("landing");
  const [activeId, setActiveId] = React.useState(content.scenarios[0]!.id);
  const scenario = content.scenarios.find((s) => s.id === activeId) ?? content.scenarios[0]!;
  const variant = locale === "ar" ? scenario.ar : scenario.en;

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [device, setDevice] = React.useState<Device>("desktop");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [shown, setShown] = React.useState("");
  const [run, setRun] = React.useState(0); // bump to (re)play the CURRENT scenario
  const [inView, setInView] = React.useState(false);

  // Start when scrolled into view (once); Replay / a model switch bump `run`.
  // Threshold lowered to 0.15 (was 0.35): the section is tall because of the
  // device frame, and 0.35 meant on a phone the visitor was already looking
  // at the middle of the device before the simulation started. 0.15 fires as
  // soon as the section is meaningfully in view.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Staged simulation. A single tracked timer plus a `cancelled` flag —
  // only one timeout is ever pending at a time, so clearing the latest
  // on cleanup stops the whole chain.
  React.useEffect(() => {
    if (!inView) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(variant.reply);
      setPhase("done");
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const beginStreaming = () => {
      const tokens = chunkForStream(variant.reply);
      let i = 0;
      let acc = "";
      const step = () => {
        if (cancelled) return;
        const tok = tokens[i];
        if (tok === undefined) {
          setPhase("done");
          return;
        }
        acc += tok;
        i += 1;
        setShown(acc);
        timer = window.setTimeout(step, delayAfter(tok, STREAM_BASE_MS));
      };
      step();
    };

    setShown("");
    setPhase("user");

    timer = window.setTimeout(() => {
      if (cancelled) return;
      setPhase("thinking");
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("streaming");
        beginStreaming();
      }, THINKING_MS);
    }, USER_BUBBLE_MS);

    return () => {
      cancelled = true;
      clearTimer();
    };
    // `activeId` is intentionally in the dep array (not just `run`):
    // switching scenarios must restart the stream from scratch even if
    // `run` hasn't changed, same as bumping `run` does for a replay.
  }, [inView, run, activeId, variant.reply]);

  // Reset phase/shown in the same update as `run` so there is never a
  // frame where the old "done" state is visible after a replay click.
  function resetAndBumpRun() {
    setShown("");
    setPhase("idle");
    setRun((n) => n + 1);
  }

  function selectScenario(id: string) {
    if (id !== activeId) setActiveId(id);
    resetAndBumpRun();
  }

  const showTabs = content.scenarios.length > 1;

  const chat = (
    <ChatBody
      variant={variant}
      phase={phase}
      shown={shown}
      modelName={scenario.modelName}
      showTabs={showTabs}
    />
  );

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="t-h3 text-foreground">{t("demo.title")}</h3>
        {content.simulated && <Badge variant="warning">{t("demo.simulatedBadge")}</Badge>}
      </div>

      {showTabs && (
        <div role="tablist" aria-label={t("demo.modelTabsLabel")} className="flex flex-wrap gap-1.5">
          {content.scenarios.map((s) => (
            <ModelTab
              key={s.id}
              scenario={s}
              active={s.id === activeId}
              onSelect={() => selectScenario(s.id)}
            />
          ))}
        </div>
      )}

      {/* Showcase card: device toggle above, device frame below. */}
      <div className="rounded-[16px] border border-border bg-card/40 p-5 sm:p-8">
        <div className="mb-5 flex justify-center">
          <div
            role="tablist"
            aria-label={t("demo.deviceTabsLabel")}
            className="inline-flex rounded-[10px] border border-input bg-secondary p-1"
          >
            {DEVICES.map(({ id, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={device === id}
                onClick={() => setDevice(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  device === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(`demo.devices.${id}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          {device === "desktop" && <Safari className="max-w-2xl">{chat}</Safari>}
          {device === "iphone" && <Iphone>{chat}</Iphone>}
          {device === "android" && <Android>{chat}</Android>}
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={resetAndBumpRun}
          className="rounded-[9px] border border-input bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-card"
        >
          {t("demo.replay")}
        </button>
      </div>
    </div>
  );
}

function ChatBody({
  variant,
  phase,
  shown,
  modelName,
  showTabs,
}: {
  variant: DemoVariant;
  phase: Phase;
  shown: string;
  modelName: string;
  showTabs: boolean;
}) {
  const t = useTranslations("landing");

  const promptVisible = phase !== "idle";
  const replyVisible = phase === "thinking" || phase === "streaming" || phase === "done";
  const streaming = phase === "thinking" || phase === "streaming";

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto p-3">
      <div
        dir="auto"
        className={cn(
          "ms-auto max-w-[85%] rounded-[11px] rounded-ee-[3px] bg-primary px-3 py-2 text-[11.5px] leading-[1.55] text-primary-foreground",
          "transition-all duration-500 ease-out",
          promptVisible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        {variant.prompt}
      </div>

      <div
        dir="auto"
        aria-live="off"
        aria-busy={streaming}
        className={cn(
          "min-h-[2.25rem] max-w-[92%] rounded-[11px] rounded-ss-[3px] bg-secondary px-3 py-2 text-[11.5px] leading-[1.6] text-secondary-foreground",
          "transition-all duration-500 ease-out",
          replyVisible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        {phase === "thinking" ? (
          <span className="inline-flex items-center gap-1.5 py-0.5" role="status" aria-label={t("demo.thinking")}>
            <span className="inline-flex gap-0.5">
              <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="size-1 animate-bounce rounded-full bg-current" />
            </span>
            {showTabs && (
              <span className="text-[10px] leading-tight text-muted-foreground">
                {t("demo.thinkingAs", { model: modelName })}
              </span>
            )}
          </span>
        ) : phase === "streaming" || phase === "done" ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {phase === "done" ? shown : balanceMarkdown(shown)}
            </ReactMarkdown>
            {phase === "streaming" && (
              <span className="ms-0.5 inline-block h-3 w-[2px] animate-pulse bg-current align-middle" />
            )}
          </>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-2 text-[10px] leading-tight text-muted-foreground transition-opacity duration-500",
          phase === "done" ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={phase !== "done"}
      >
        <span>{t("demo.inputTokens", { count: variant.inputTokens })}</span>
        <span>{t("demo.outputTokens", { count: variant.outputTokens })}</span>
        <span className="font-semibold text-foreground">
          {t("demo.totalCost", { price: variant.costYer })}
        </span>
      </div>
    </div>
  );
}

function ModelTab({
  scenario,
  active,
  onSelect,
}: {
  scenario: DemoScenario;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start rounded-[10px] border px-3 py-1.5 text-start transition-colors",
        active
          ? "border-primary bg-accent text-accent-foreground"
          : "border-input bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="text-[13px] font-medium leading-tight">{scenario.modelName}</span>
      {scenario.modelBadge && <span className="t-caption leading-tight">{scenario.modelBadge}</span>}
    </button>
  );
}