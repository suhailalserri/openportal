import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The page's <main> landmark. `id="main-content"` is the target of the
 * shell's skip link; tabIndex=-1 lets that link move focus here.
 */
export function Main({ className, ...props }: React.ComponentProps<"main">) {
  return <main id="main-content" tabIndex={-1} className={cn("min-w-0 flex-1 outline-none", className)} {...props} />;
}
