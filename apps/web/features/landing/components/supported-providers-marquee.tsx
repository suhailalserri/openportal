import { getTranslations } from "next-intl/server";

import { AppProviderIcon } from "@/components/icons/provider-icon";

/**
 * apps/web/features/landing/components/supported-providers-marquee.tsx
 *
 * "All the providers we route to" strip. Same CSS-only marquee pattern
 * as ./payment-marquee.tsx (duplicated `aria-hidden` pass for a seamless
 * loop, `.animate-marquee` from styles/index.css, pauses on hover,
 * collapses to a wrapped static row under `prefers-reduced-motion`) —
 * copied rather than shared because payment methods are server data
 * (LandingPaymentMethodView[]) while this list is a fixed, curated set
 * of brand keys, not something that comes from getLandingData().
 *
 * DELIBERATELY NOT every key `@lobehub/icons` ships (150+, see
 * components/icons/provider-icon.tsx's PROVIDER_ICON_OPTIONS) — that
 * full list is for the admin's "pick an icon" search, not a marketing
 * strip. This is a curated subset of providers the gateway actually
 * fronts. Add/remove keys here as New API's configured channels change;
 * this is intentionally static copy, not driven by the live `models`
 * table, so the strip doesn't jump around every time a new model is
 * discovered mid-sync.
 */
const FEATURED_PROVIDERS = [
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "google", label: "Google" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "qwen", label: "Qwen" },
  { key: "mistral", label: "Mistral" },
  { key: "meta", label: "Meta" },
  { key: "xai", label: "xAI" },
  { key: "moonshot", label: "Moonshot" },
  { key: "cohere", label: "Cohere" },
  { key: "perplexity", label: "Perplexity" },
  { key: "zhipu", label: "Zhipu" },
] as const;

function ProviderChip({ providerKey, label }: { providerKey: string; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2">
      <AppProviderIcon providerIconKey={providerKey} size={18} type="color" />
      <span className="text-[13.5px] font-medium text-foreground whitespace-nowrap">{label}</span>
    </div>
  );
}

export async function SupportedProvidersMarquee({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="border-y border-border bg-card/30 py-10">
      <p className="t-caption mb-6 text-center font-semibold tracking-widest uppercase">
        {t("providers.heading")}
      </p>

      <div className="group relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 z-10 w-20 bg-gradient-to-r from-background to-transparent rtl:bg-gradient-to-l"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 z-10 w-20 bg-gradient-to-l from-background to-transparent rtl:bg-gradient-to-r"
        />

        <div className="flex w-max animate-marquee items-center gap-3 group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center">
          {FEATURED_PROVIDERS.map((p) => (
            <ProviderChip key={p.key} providerKey={p.key} label={p.label} />
          ))}

          <div aria-hidden="true" className="contents">
            {FEATURED_PROVIDERS.map((p) => (
              <ProviderChip key={`${p.key}-dup`} providerKey={p.key} label={p.label} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
