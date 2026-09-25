import { getTranslations } from "next-intl/server";

import type { LandingPaymentMethodView } from "@/features/landing/types";
import { PaymentMethodChip } from "./payment-method-chip";

/**
 * apps/web/features/landing/components/payment-marquee.tsx
 *
 * Phase 3.3+ (redesign). Renders LandingPaymentMethodView — id/name/
 * logoUrl ONLY. The raw billing.listPaymentMethods row's `accountCode`
 * and `instructions` never reach this view type (build-landing-data.ts
 * drops them explicitly), so they cannot leak here even by a future
 * careless edit.
 *
 * CSS-only marquee. Track content is rendered twice (the second copy
 * `aria-hidden`) and animates 0 → -50% so the loop is seamless. Pauses
 * on hover via a pure-CSS `animation-play-state` toggle — no JS, no
 * hook. `.animate-marquee` and the reduced-motion override both live in
 * styles/index.css, so this file doesn't carry its own keyframes.
 *
 * Under `prefers-reduced-motion` the whole thing becomes a wrapped
 * centered row (still readable, just not moving).
 *
 * Renders nothing when there are no methods — a clean absence beats an
 * empty heading.
 *
 * ACCESSIBILITY: the duplicated pass is wrapped in an `aria-hidden`
 * container so screen readers announce each method exactly once. The
 * `className="contents"` on that wrapper keeps the flex layout
 * byte-identical to the un-hidden pass — `display: contents` makes the
 * wrapper itself box-less while its children participate in the
 * parent's flex flow exactly as before.
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

  return (
    <section className="border-y border-border bg-card/30 py-10">
      <p className="t-caption mb-6 text-center font-semibold tracking-widest uppercase">
        {t("payments.heading")}
      </p>

      <div className="group relative overflow-hidden">
        {/* Edge fades — mask the loop seam without needing extra mask-image utilities. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 z-10 w-20 bg-gradient-to-r from-background to-transparent rtl:bg-gradient-to-l"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 z-10 w-20 bg-gradient-to-l from-background to-transparent rtl:bg-gradient-to-r"
        />

        <div className="flex w-max animate-marquee items-center gap-12 group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center">
          {/* Pass 1 — the accessible copy. */}
          {methods.map((m) => (
            <PaymentMethodChip key={m.id} method={m} />
          ))}

          {/* Pass 2 — the duplicate that makes the loop seamless.
              aria-hidden keeps it out of the a11y tree; `contents`
              keeps its children in the same flex flow as pass 1. */}
          <div aria-hidden="true" className="contents">
            {methods.map((m) => (
              <PaymentMethodChip key={`${m.id}-dup`} method={m} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}