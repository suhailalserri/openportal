import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The page's <main> landmark. `id="main-content"` is the target of the
 * shell's skip link; tabIndex=-1 lets that link move focus here.
 *
 * `flex min-h-0 flex-col overflow-y-auto` (added alongside a mobile
 * chat-layout fix — see AppShell's own comment on the same change): a
 * plain `flex-1` here let this element grow to fit whatever its content
 * needed, which is fine for a normal page (SectionPage content just
 * makes the page taller) but is exactly what broke the chat composer on
 * mobile — with no `min-h-0`, `ChatView`'s `h-full` had nothing bounded
 * to size against, so the whole `<main>` (and the page under it) grew
 * with the conversation instead of `MessageList`'s own
 * `overflow-y-auto` doing the scrolling, dragging the composer up and
 * down with it. `min-h-0` lets this element actually respect the fixed
 * height `AppShell`'s root now provides (`h-dvh`), and `overflow-y-auto`
 * here is what makes every OTHER page (billing, settings, admin — none
 * of which manage their own height) keep scrolling normally now that
 * the page itself no longer can. Chat specifically never needs this
 * scroll to engage, because `ChatView` fills exactly `h-full` and
 * handles its own internal scrolling — see `chat-view.tsx`'s
 * `MessageList` usage.
 */
export function Main({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto outline-none", className)}
      {...props}
    />
  );
}
