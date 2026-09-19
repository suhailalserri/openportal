import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-[11px] border border-input bg-secondary px-[13px] py-[11px] text-sm text-foreground transition-[border-color,box-shadow] outline-none",
        "placeholder:text-faint-foreground",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
