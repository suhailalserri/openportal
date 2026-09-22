import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/chat/composer-icon-button.tsx
 *
 * Phase 4c (rework). The round 36px icon button used along the composer's
 * bottom row (attach, parameters, mic). Presentational; the caller supplies
 * the icon as a child and the accessible name as `aria-label`.
 *
 * `active` marks a button whose inline panel is open. Placeholder buttons
 * (attach, mic — not wired yet) should pass `aria-disabled="true"` instead
 * of `disabled`: a `disabled` button swallows the tap, so the user gets no
 * feedback, whereas `aria-disabled` keeps it focusable and lets the caller
 * show a "coming soon" hint.
 */
export interface ComposerIconButtonProps extends React.ComponentProps<"button"> {
  active?: boolean;
}

export function ComposerIconButton({
  className,
  active,
  type = "button",
  ...props
}: ComposerIconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground outline-none transition-[background-color,color,transform] duration-150",
        "hover:not-disabled:bg-border hover:not-disabled:text-foreground active:not-disabled:scale-95",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:opacity-60",
        "[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
