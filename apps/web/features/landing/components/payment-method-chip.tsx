import Image from "next/image";

import { cn } from "@/lib/utils";
import type { LandingPaymentMethodView } from "../types";

/**
 * apps/web/features/landing/components/payment-method-chip.tsx
 *
 * One payment method rendered as: [logo] on top, [name] below. Used by
 * PaymentMarquee.
 *
 * `logoUrl` arrives already validated by `safeLogoUrl` in
 * build-landing-data.ts — it is either a same-origin path
 * ("/payment-logos/jaib.svg") or an absolute https URL, or null.
 * `next/image` handles the same-origin case out of the box; if an admin
 * ever sets an EXTERNAL https URL, add that domain to next.config's
 * `images.remotePatterns` — otherwise Next.js refuses to render it. The
 * recommended setup is same-origin SVGs under apps/web/public/payment-logos/.
 *
 * Server Component: no hooks, no browser APIs.
 */
export function PaymentMethodChip({
  method,
  className,
}: {
  method: LandingPaymentMethodView;
  className?: string;
}) {
  const initial = method.name.charAt(0).toUpperCase();
  const hasLogo = !!method.logoUrl;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-2 opacity-75 grayscale",
        "transition-[opacity,filter,transform] duration-300",
        "hover:-translate-y-0.5 hover:opacity-100 hover:grayscale-0",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-11 items-center justify-center overflow-hidden rounded-[12px] border border-border bg-card",
          !hasLogo && "bg-[linear-gradient(155deg,color-mix(in_oklab,var(--color-primary)_12%,var(--color-background)),var(--color-background))]",
        )}
      >
        {hasLogo ? (
          <Image
            src={method.logoUrl!}
            alt=""
            width={44}
            height={44}
            className="size-full object-contain p-1.5"
          />
        ) : (
          <span className="text-base font-semibold text-primary">
            {initial}
          </span>
        )}
      </div>
      <span className="max-w-[90px] truncate text-center text-[11px] font-medium text-muted-foreground">
        {method.name}
      </span>
    </div>
  );
}