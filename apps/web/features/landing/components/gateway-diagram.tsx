import { getTranslations } from "next-intl/server";

import { AnimatedBeamMultipleOutput } from "@/components/magicui/animated-beam-multiple-output";
import { Reveal } from "@/components/ui/reveal";

/**
 * apps/web/features/landing/components/gateway-diagram.tsx
 *
 * Phase 3.3+ (redesign). The "one portal to every model" section: an
 * animated beam diagram (user → OpenPortal → 5 providers) plus three
 * short notes below it (one endpoint / one balance / one bill).
 *
 * Server Component. It only composes static copy (from the `landing`
 * namespace) with a Client Component (`AnimatedBeamMultipleOutput`,
 * which owns the refs and the beam measurement). No data dependency.
 *
 * Placed right after `LandingIntro` in features/landing/index.tsx —
 * the visitor reads "who we are" (intro) then "how it works" (this) in
 * one continuous beat before any prices appear.
 */
export async function GatewayDiagram({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  const notes = [
    { key: "oneEndpoint", titleKey: "gateway.oneEndpoint", bodyKey: "gateway.oneEndpointBody" },
    { key: "oneBalance",  titleKey: "gateway.oneBalance",  bodyKey: "gateway.oneBalanceBody" },
    { key: "oneBill",     titleKey: "gateway.oneBill",     bodyKey: "gateway.oneBillBody" },
  ] as const;

  return (
    <section
      id="how"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24"
    >
      <Reveal direction="up">
        <div className="mx-auto max-w-2xl text-center">
          <p className="t-caption mb-3 font-semibold tracking-widest text-primary uppercase">
            {t("gateway.eyebrow")}
          </p>
          <h2 className="t-h2 text-balance text-foreground">{t("gateway.title")}</h2>
          <p className="t-small mt-4 text-balance">{t("gateway.subtitle")}</p>
        </div>
      </Reveal>

      <Reveal direction="up" delay={0.1}>
        <div className="mt-10 overflow-hidden rounded-[20px] border border-border bg-card/40 backdrop-blur-sm">
          <AnimatedBeamMultipleOutput />
        </div>
      </Reveal>

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {notes.map((note, i) => (
          <Reveal key={note.key} direction="up" delay={0.15 + i * 0.08}>
            <div className="flex gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary">
                {note.key === "oneEndpoint" ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                    aria-hidden="true"
                  >
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                ) : note.key === "oneBalance" ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                    aria-hidden="true"
                  >
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9" />
                    <path d="M21 3v6h-6" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground">
                  {t(note.titleKey)}
                </h3>
                <p className="t-small mt-1 leading-relaxed">{t(note.bodyKey)}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}