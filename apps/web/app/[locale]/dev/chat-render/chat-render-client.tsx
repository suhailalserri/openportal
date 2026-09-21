"use client";

import * as React from "react";

import { MessageList } from "@/features/chat/components/message/message-list";
import {
  CHAT_RENDER_FIXTURE,
  CHAT_RENDER_ERROR,
  XSS_FIXTURES,
} from "@/content/demo/chat-render-fixture";

/**
 * apps/web/app/[locale]/dev/chat-render/chat-render-client.tsx
 *
 * Phase 4a's "done when" preview: check /ar/dev/chat-render and
 * /en/dev/chat-render (both themes) and confirm a long Arabic answer
 * with an embedded code block renders correctly in RTL — code block
 * itself stays LTR — plus a standalone visual check that the XSS
 * fixtures (also covered by the automated test at
 * components/markdown/safe-markdown.test.tsx) render visibly inert: no
 * alert, no navigation on click, no loaded image.
 */
export function ChatRenderClient() {
  const [showErrorState, setShowErrorState] = React.useState(true);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-10">
      <section>
        <h2 className="t-h3 mb-4">Fixture — Arabic + code block + partial turn + error</h2>
        <div className="h-[600px] rounded-xl border border-border bg-background p-4">
          <MessageList
            messages={CHAT_RENDER_FIXTURE}
            error={showErrorState ? CHAT_RENDER_ERROR : undefined}
            userInitial="ف"
            hasMore
            onLoadMore={() => {}}
            onCopy={() => {}}
            onRegenerate={() => {}}
            onFeedback={() => {}}
            onRetryError={() => setShowErrorState(false)}
            className="h-full"
          />
        </div>
      </section>

      <section>
        <h2 className="t-h3 mb-4">XSS fixtures — must render inert</h2>
        <p className="t-small mb-4 text-muted-foreground">
          No alert should fire, no navigation should occur on click, and the &quot;tracking
          pixel&quot; must render as a placeholder chip, never a loaded &lt;img&gt;.
        </p>
        <div className="h-[420px] rounded-xl border border-border bg-background p-4">
          <MessageList messages={XSS_FIXTURES} className="h-full" />
        </div>
      </section>
    </div>
  );
}
