"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

/**
 * Not in the plan's 1.2 primitive list, but `form.tsx` (FormLabel)
 * structurally requires a Label primitive underneath it — shadcn's own
 * form.tsx imports this exact component. Added in 1.2, restyled here to
 * match `.field label` (12.5px / 500 / muted) from the theme HTML.
 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex select-none items-center gap-2 text-[12.5px] leading-none font-medium text-muted-foreground",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
