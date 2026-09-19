import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Ported from `.btn` / `.btn-primary` / `.btn-outline` / `.btn-secondary` /
 * `.btn-ghost` / `.btn-danger` / `.btn-sm` / `.btn-lg` in
 * docs/design/design-preview.html (Session "restyle", post-1.2).
 *
 * `--primary-foreground` / `--accent` / `--accent-foreground` were already
 * defined in theme.css to mirror the source file's gate-wash / gate-strong /
 * send-btn ink exactly, so no new tokens were needed here — see theme.css.
 *
 * Kept from the old primitive (not in the source file, back-compat):
 * `variant="link"`. The source file has no link-style button.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[11px] text-[13.5px] font-semibold leading-tight border border-transparent transition-[background-color,border-color,filter,color,transform] duration-150 outline-none disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed active:not-disabled:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:not-disabled:brightness-[1.08]",
        secondary:
          "bg-secondary border-input text-muted-foreground hover:not-disabled:text-foreground hover:not-disabled:border-faint-foreground",
        outline:
          "bg-transparent border-primary text-accent-foreground font-medium hover:not-disabled:bg-accent",
        ghost: "bg-transparent text-muted-foreground hover:not-disabled:bg-border hover:not-disabled:text-foreground",
        destructive:
          "bg-destructive/10 border-destructive text-destructive hover:not-disabled:bg-destructive hover:not-disabled:text-destructive-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-auto px-4 py-2.5",
        sm: "h-auto rounded-[9px] px-[11px] py-[7px] text-[12.5px]",
        lg: "h-auto rounded-[13px] px-[22px] py-[13px] text-[15px]",
        icon: "size-[34px] rounded-[9px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
