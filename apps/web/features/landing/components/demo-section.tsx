"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { DemoContent } from "@/features/landing/lib/demo-content";

/**
 * apps/web/features/landing/components/demo-section.tsx
 *
 * Phase 3.3. Plays content/demo/simulated-chat.json as a small typing
 * demo. HIDDEN ENTIRELY when there is no content (parseDemoContent
 * returned null, or the section wasn't rendered by the parent at all) —
 * this component assumes it is only mounted when `content` is non-null;
 * the parent (index.tsx) is what decides whether to render it.
 *
 * `content.simulated` drives a visible badge (see demo-content.ts's own
 * doc: invented numbers must never be presented as real). This is not a
 * cosmetic detail — it's the entire reason the badge exists.
 */

export function DemoSection({ locale, content }: { locale: string; content: DemoContent }) {
  const t = useTranslations("landing");
  const variant = locale === "ar" ? content.ar : content.en;
  const [typed, setTyped] = React.useState("");
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    setTyped("");
    setDone(false);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setTyped(variant.reply);
      setDone(true);
      return;
    }

    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setTyped(variant.reply.slice(0, i));
      if (i >= variant.reply.length) {
        window.clearInterval(id);
        setDone(true);
      }
    }, 18);
    return () => window.clearInterval(id);
  }, [variant.reply]);

  return (
    <div className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="t-h3 text-foreground">{t("demo.title")}</h3>
        {content.simulated && <Badge variant="warning">{t("demo.simulatedBadge")}</Badge>}
      </div>

      <div className="space-y-3">
        <div className="ms-auto max-w-[85%] rounded-[13px] rounded-ee-[3px] bg-primary px-4 py-2.5 text-primary-foreground">
          {variant.prompt}
        </div>
        <div className="max-w-[85%] rounded-[13px] rounded-ss-[3px] bg-secondary px-4 py-2.5 text-secondary-foreground">
          <span className="whitespace-pre-wrap">{typed}</span>
          {!done && <span className="ms-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 t-caption">
        <span>{t("demo.inputTokens", { count: variant.inputTokens })}</span>
        <span>{t("demo.outputTokens", { count: variant.outputTokens })}</span>
        <span className="font-semibold text-foreground">{t("demo.totalCost", { price: variant.costYer })}</span>
      </div>
    </div>
  );
}
