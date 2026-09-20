import Image from "next/image";
import { getTranslations } from "next-intl/server";

import type { LandingPaymentMethodView } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/payment-marquee.tsx
 *
 * Phase 3.3. Renders LandingPaymentMethodView — id/name/logoUrl ONLY.
 * `accountCode` (wallet numbers) and `instructions` exist on the raw
 * billing.listPaymentMethods row but are never copied onto this view
 * type (see types.ts's doc comment on LandingPaymentMethodView) and so
 * cannot leak here even by a future careless edit to this file; the
 * TypeScript type itself is the guard. `logoUrl` was already validated
 * server-side by lib/safe-url.ts (safeLogoUrl) before reaching this
 * view — this component trusts that and does not re-validate.
 *
 * A CSS-only marquee (duplicated content + `animate-marquee`, defined in
 * styles/index.css) rather than a JS carousel library — one more small
 * dependency avoided, and it degrades to a static wrapped row under
 * reduced motion (see the media query alongside the keyframe).
 */

export async function PaymentMarquee({
  locale,
  methods,
}: {
  locale: string;
  methods: LandingPaymentMethodView[];
}) {
  if (methods.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "landing" });

  // Duplicate once so the CSS animation can scroll from 0% to -50% and
  // loop seamlessly without a visible seam.
  const track = [...methods, ...methods];

  return (
    <section className="border-y border-border bg-card/30 py-8">
      <p className="t-small mb-4 text-center">{t("payments.heading")}</p>
      <div className="group relative overflow-hidden">
        <div className="flex w-max animate-marquee items-center gap-10 group-hover:[animation-play-state:paused]">
          {track.map((m, i) => (
            <div key={`${m.id}-${i}`} className="flex shrink-0 items-center gap-2 opacity-80 grayscale">
              {m.logoUrl ? (
                <Image src={m.logoUrl} alt={m.name} width={28} height={28} className="h-7 w-auto object-contain" />
              ) : null}
              <span className="t-small whitespace-nowrap">{m.name}</span>
            </div>
          ))}
        </div>
        {/* Edge fades so the loop point never looks like a hard cut. */}
        <div className="pointer-events-none absolute inset-y-0 start-0 w-12 bg-gradient-to-r from-background to-transparent rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute inset-y-0 end-0 w-12 bg-gradient-to-l from-background to-transparent rtl:bg-gradient-to-r" />
      </div>
    </section>
  );
}
