"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Ported from `.switch` (42×24 track, 18×18 thumb) in the theme HTML.
 * The source's checked-track color is `--gate-wash-strong`. Previously
 * approximated as `bg-primary/20` because theme.css had no matching
 * token; `--accent-strong` was added this session (styles/theme.css) so
 * this now uses the exact value instead.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-[42px] shrink-0 items-center rounded-full border transition-colors duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-accent-strong data-[state=checked]:border-primary",
        "data-[state=unchecked]:bg-secondary data-[state=unchecked]:border-input",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-[18px] rounded-full transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-0.5",
          "data-[state=unchecked]:bg-faint-foreground",
          "data-[state=checked]:bg-accent-foreground data-[state=checked]:translate-x-[19px]",
          "rtl:data-[state=checked]:-translate-x-[19px]"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
