import * as React from "react";

import { cn } from "@/lib/utils";

interface SectionPageProps {
  title: React.ReactNode;
  description?: React.ReactNode | undefined;
  /** Right/left-aligned (logical end) buttons next to the title. */
  actions?: React.ReactNode | undefined;
  className?: string | undefined;
  children?: React.ReactNode | undefined;
}

/**
 * Standard page frame for everything rendered inside the shell: width
 * cap, padding, and a title row. No hooks — usable from server pages.
 */
export function SectionPage({ title, description, actions, className, children }: SectionPageProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
