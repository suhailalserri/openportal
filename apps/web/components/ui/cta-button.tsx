import * as React from "react";

import { ShimmerButton, type ShimmerButtonProps } from "@/components/magicui/shimmer-button";
import { cn } from "@/lib/utils";

/**
 * apps/web/components/ui/cta-button.tsx
 *
 * The site's call-to-action button: Magic UI's Shimmer Button
 * (components/magicui/shimmer-button.tsx, unmodified look) with this
 * theme's brand colours applied once, so pages just write
 * `<CtaButton>` / `<CtaButton asChild><Link/></CtaButton>`.
 *
 * `--primary` is the fill; the spark is white so it reads on the gold in
 * both light and dark. Radius matches the other buttons (13px).
 */
interface CtaButtonProps extends ShimmerButtonProps {
  size?: "default" | "lg";
}

export const CtaButton = React.forwardRef<HTMLButtonElement, CtaButtonProps>(
  ({ size = "lg", className, ...props }, ref) => (
    <ShimmerButton
      ref={ref}
      background="var(--primary)"
      shimmerColor="#ffffff"
      borderRadius="13px"
      shimmerDuration="3.2s"
      className={cn(
        "font-semibold text-primary-foreground",
        size === "lg" ? "px-[22px] py-[13px] text-[15px]" : "px-4 py-2.5 text-[13.5px]",
        className,
      )}
      {...props}
    />
  ),
);
CtaButton.displayName = "CtaButton";
