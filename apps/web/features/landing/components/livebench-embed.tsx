"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { CtaButton } from "@/components/ui/cta-button";

/**
 * apps/web/features/landing/components/livebench-embed.tsx
 *
 * Phase 3.3. Embeds livebench.ai's public leaderboard next to our own
 * models table (which shows curated "best for" tags — see
 * config/model-tags.ts's doc for why scores themselves aren't
 * reproduced here without LiveBench's permission).
 *
 * THREE KNOWN LIMITS (flagged before this was built, still true):
 *  1. Cross-origin styling: the frame around the iframe is themed
 *     (border, radius, background, header bar) with our own tokens; the
 *     iframe's OWN content is LiveBench's page and cannot be restyled.
 *  2. May be blocked: if livebench.ai sends X-Frame-Options or
 *     frame-ancestors, the iframe renders blank and `onLoad` can still
 *     fire — this is NOT verifiable without actually loading it in a
 *     real browser against the real site (flagged as unverified in this
 *     phase's summary). The "Open on livebench.ai" link is therefore
 *     ALWAYS visible, not a fallback that only appears on failure.
 *  3. CSP: no Content-Security-Policy exists anywhere in this repo yet
 *     (checked next.config.* and middleware.ts — neither sets one), so
 *     there is currently nothing to add a frame-src allowance to. If a
 *     CSP is introduced later, livebench.ai must be added to frame-src
 *     at that time.
 *
 * LOAD ON CLICK: the iframe does not mount until the visitor asks for
 * it, so a heavy third-party page never loads by default on a phone.
 */

export function LiveBenchEmbed() {
  const t = useTranslations("landing");
  const [shown, setShown] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  return (
    <div className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="t-h3 text-foreground">{t("livebench.title")}</h3>
          <p className="t-small mt-1 max-w-lg">{t("livebench.description")}</p>
        </div>
        <a
          href="https://livebench.ai/#/"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="t-small shrink-0 text-primary underline underline-offset-4 hover:brightness-110"
        >
          {t("livebench.openLink")} ↗
        </a>
      </div>

      {!shown ? (
        <CtaButton type="button" size="default" onClick={() => setShown(true)}>
          {t("livebench.showButton")}
        </CtaButton>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-border bg-muted">
          <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
            <span className="t-caption">livebench.ai</span>
            {!loaded && <span className="t-caption">{t("livebench.loading")}</span>}
          </div>
          <iframe
            src="https://livebench.ai/#/"
            title="LiveBench"
            className="h-[70vh] w-full"
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </div>
      )}
    </div>
  );
}
