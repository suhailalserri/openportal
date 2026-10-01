import type { ChatMessage } from "../types";

/**
 * apps/web/features/chat/lib/wire-messages.ts
 *
 * P6.3a. The one place a transcript becomes the `messages` array of a /chat
 * request. Lifted out of use-chat-stream.ts unchanged in behaviour so the rule
 * below has a test:
 *
 *   ONLY `role` and `content` go over the wire.
 *
 * `thinking` (reasoning shown in the Thinking block), `isPartial`, token and
 * credit fields and every other display-only field are dropped here, so the
 * model never receives its own reasoning back as history, and the server's
 * strict chat schema never sees a field it does not know. A `system` row is
 * filtered out rather than cast: the server no longer accepts a client-supplied
 * system role at all (chat.schema.ts), and an unexpected one silently vanishing
 * from a request is the safer failure.
 *
 * ONE DELIBERATE BEHAVIOUR ADDITION: an assistant turn with no answer text is
 * left out. With the v2 stream a reply can be reasoning only (the model spent
 * its whole budget thinking), which leaves a message with `content: ""` in the
 * transcript. The server's schema accepts an empty string, but providers are
 * free to reject an empty assistant message, which would turn the person's NEXT
 * question into an error. Turns that have any text are unaffected.
 */
export function toWireMessages(
  messages: ChatMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .filter((m) => m.role === "user" || m.content.trim().length > 0)
    .map(({ role, content }) => ({ role, content }));
}
