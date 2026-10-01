import { cn } from "@/lib/utils";

/**
 * apps/web/features/chat/components/message/typing-indicator.tsx
 *
 * The three-bouncing-dots row shown in the gap between "user message
 * sent" and "assistant's first token arrived" — i.e. exactly
 * `chat-stream-reducer.ts`'s `status === "sending"` window, where the
 * user turn is already appended but no assistant `ChatMessage` exists
 * yet (that draft is only created lazily on the first CHUNK — see that
 * reducer's own header comment). MessageList renders this in the same
 * slot an assistant bubble would occupy next, so it reads as "the
 * assistant's reply is forming here" rather than a generic spinner
 * elsewhere on the page.
 *
 * Ported 1:1 from docs/design/design-preview.html's `.typing`/`.typing
 * span`/`@keyframes blink` (`--gate` dot, 7px, staggered 0/.18s/.36s
 * delays) — `bg-primary` is this app's semantic token for that same
 * "gate" gold in both the light and dark theme, so no raw hex needed
 * here, it just tracks whichever theme is active the same way every
 * other primary-colored affordance in the app does.
 */
export function TypingIndicator({
  className,
  label,
}: {
  className?: string | undefined;
  /** P6.3a. The status line: the server said the request is accepted but the
   *  model has not produced anything yet (v2 stream's `status` event; the UI
   *  picks the wording). Absent = the plain dots, exactly as before. */
  label?: string | undefined;
}) {
  return (
    <div
      className={cn("flex items-center gap-2.5 py-1", className)}
      role="status"
      // Dots only: decorative, as before. With a label the row is real content.
      aria-hidden={label ? undefined : "true"}
    >
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <span className="size-[7px] animate-typing-blink rounded-full bg-primary [animation-delay:0ms]" />
        <span className="size-[7px] animate-typing-blink rounded-full bg-primary [animation-delay:180ms]" />
        <span className="size-[7px] animate-typing-blink rounded-full bg-primary [animation-delay:360ms]" />
      </span>
      {label && <span className="text-[12.5px] text-faint-foreground">{label}</span>}
    </div>
  );
}
