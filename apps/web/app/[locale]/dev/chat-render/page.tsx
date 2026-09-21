import { notFound } from "next/navigation";

import { ChatRenderClient } from "./chat-render-client";

/**
 * Same env-gate convention as /dev/kitchen-sink — see that page's own
 * header comment for why NODE_ENV can't be used here (Vercel builds
 * every deployment, preview and production, with NODE_ENV=production).
 * Reuses HIDE_KITCHEN_SINK rather than introducing a second env var for
 * what is, from a "should this be visible in prod" standpoint, the exact
 * same question. Worth splitting into a dedicated HIDE_DEV_PAGES var if
 * a third /dev page needs the same gate and two names starts to read as
 * an inconsistency rather than reuse.
 */
export default function ChatRenderPage() {
  if (process.env.HIDE_KITCHEN_SINK === "true") notFound();

  return <ChatRenderClient />;
}
