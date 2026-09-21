import { notFound } from "next/navigation";

import { ChatComposerClient } from "./chat-composer-client";

/**
 * Same env-gate as /dev/kitchen-sink and /dev/chat-render (see
 * kitchen-sink/page.tsx for why NODE_ENV can't be used on Vercel).
 * This is now the THIRD /dev page sharing HIDE_KITCHEN_SINK — the note in
 * chat-render/page.tsx said to split it into a dedicated HIDE_DEV_PAGES
 * var at the third; that rename touches env config outside this phase, so
 * it is flagged in BRANCH_AND_CI_NOTES.md instead of done here.
 */
export default function ChatComposerPage() {
  if (process.env.HIDE_KITCHEN_SINK === "true") notFound();

  return <ChatComposerClient />;
}
