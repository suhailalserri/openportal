"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { DemoContent } from "@/features/landing/lib/demo-content";
import { balanceMarkdown, chunkForStream, delayAfter } from "@/features/landing/lib/stream-demo";

/**
 * apps/web/features/landing/components/demo-section.tsx
 *
 * Phase 3.3. Replays content/demo/simulated-chat.json as a live-looking
 * model stream: a short "thinking" pause, then the reply arrives token
 * by token with MARKDOWN RENDERED as it goes (bold, lists), then the
 * usage line appears. Starts when the card scrolls into view; a Replay
 * button plays it again. Reduced motion shows the finished reply at
 * once (still rendered markdown).
 *
 * It is a replay of stored text, not a model call — so the "Simulated
 * example" badge stays (see demo-content.ts on why that is not cosmetic).
 * HIDDEN ENTIRELY by the parent when there is no content.
 */

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 ps-5">{children}</ol>,
  li: ({ children }) => <li className="ps-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code dir="ltr" className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
      {children}
    </a>
  ),
};

type Phase = "idle" | "thinking" | "streaming" | "done";

export function DemoSection({ locale, content }: { locale: string; content: DemoContent }) {
  const t = useTranslations("landing");
  const variant = locale === "ar" ? content.ar : content.en;

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [shown, setShown] = React.useState("");
  const [run, setRun] = React.useState(0); // bump to (re)play
  const [inView, setInView] = React.useState(false);

  // Start when scrolled into view (once); Replay bumps `run` directly.
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
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (!inView) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(variant.reply);
      setPhase("done");
      return;
    }

    const tokens = chunkForStream(variant.reply);
    let i = 0;
    let acc = "";
    let timer = 0;
    let cancelled = false;

    setShown("");
    setPhase("thinking");

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
      setPhase("streaming");
      timer = window.setTimeout(step, delayAfter(tok));
    };

    timer = window.setTimeout(step, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inView, run, variant.reply]);

  const streaming = phase === "thinking" || phase === "streaming";

  return (
    <div ref={rootRef} className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="t-h3 text-foreground">{t("demo.title")}</h3>
        {content.simulated && <Badge variant="warning">{t("demo.simulatedBadge")}</Badge>}
      </div>

      <div className="space-y-3">
        <div
          dir="auto"
          className="ms-auto max-w-[85%] rounded-[13px] rounded-ee-[3px] bg-primary px-4 py-2.5 text-primary-foreground"
        >
          {variant.prompt}
        </div>

        <div
          dir="auto"
          aria-live="off"
          aria-busy={streaming}
          className="min-h-[3rem] max-w-[92%] rounded-[13px] rounded-ss-[3px] bg-secondary px-4 py-3 text-[15px] leading-[1.65] text-secondary-foreground"
        >
          {phase === "idle" || phase === "thinking" ? (
            <span className="inline-flex items-center gap-1 py-1" role="status" aria-label={t("demo.thinking")}>
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current" />
            </span>
          ) : (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {phase === "done" ? shown : balanceMarkdown(shown)}
              </ReactMarkdown>
              {phase === "streaming" && (
                <span className="ms-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
              )}
            </>
          )}
        </div>
      </div>

      <div
        className={`mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4 t-caption transition-opacity duration-500 ${
          phase === "done" ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={phase !== "done"}
      >
        <span>{t("demo.inputTokens", { count: variant.inputTokens })}</span>
        <span>{t("demo.outputTokens", { count: variant.outputTokens })}</span>
        <span className="font-semibold text-foreground">{t("demo.totalCost", { price: variant.costYer })}</span>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="ms-auto text-primary underline underline-offset-4 hover:brightness-110"
        >
          {t("demo.replay")}
        </button>
      </div>
    </div>
  );
}
