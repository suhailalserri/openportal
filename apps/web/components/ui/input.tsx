import * as React from "react";

import { cn } from "@/lib/utils";

/** Ported from `.input, .select` + `.input.invalid` in the theme HTML. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-auto w-full min-w-0 rounded-[11px] border border-input bg-secondary px-[13px] py-[11px] text-sm text-foreground transition-[border-color,box-shadow] outline-none",
        "placeholder:text-faint-foreground",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  );
}

export { Input };
