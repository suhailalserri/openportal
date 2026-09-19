import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Ported from `.chip` / `.chip.ok` / `.chip.pending` / `.chip.error` /
 * `.chip.neutral` in the theme HTML. Variant names kept from the existing
 * primitive (default/secondary/destructive/success/warning/info/outline)
 * for back-compat with anything already typed against them; each maps to
 * the closest `.chip` tone. `.chip.dot`/`.chip.live` (leading pulse dot)
 * are not ported — no consumer needs them yet, flagged for later.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground", // .chip.pending
        secondary: "bg-border text-muted-foreground", // .chip.neutral
        destructive: "bg-destructive/10 text-destructive", // .chip.error
        success: "bg-success/10 text-success", // .chip.ok
        warning: "bg-accent text-accent-foreground",
        info: "bg-info/10 text-info",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
