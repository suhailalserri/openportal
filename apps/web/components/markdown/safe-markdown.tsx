"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

/**
 * apps/web/components/markdown/safe-markdown.tsx
 *
 * Renders UNTRUSTED model output as markdown. Rule 7
 * (FRONTEND_REBUILD_PLAN.md §3): "Model output is untrusted. No
 * rehype-raw, no dangerouslySetInnerHTML, remote markdown images are not
 * auto-loaded, links get rel=noopener noreferrer." Every one of those is
 * enforced below:
 *   - no rehype-raw in the plugin list, no dangerouslySetInnerHTML
 *     anywhere in this file — a `<script>` in a model response is just
 *     inert text, react-markdown never parses raw HTML into real DOM.
 *   - `img` is overridden to render an inert placeholder chip; the real
 *     `src` is never used, so a remote image can't act as a tracking
 *     pixel / IP-logging vector.
 *   - `a` is overridden to force `rel="noopener noreferrer"`.
 * See components/markdown/safe-markdown.test.tsx for the XSS fixtures
 * this is checked against (a `<script>` tag, a `javascript:` link, and a
 * remote `![]()` image).
 *
 * Distinct from features/legal/components/legal-doc-view.tsx, which
 * renders OUR OWN committed markdown (trusted, server component, no
 * remote-image/code-block handling needed — see that file's own header
 * comment). This is the renderer for anything that came back from a
 * model. "use client" here (unlike legal-doc-view.tsx) because the
 * remote-image placeholder's label and the inline-code styling both
 * need `next-intl`'s `useTranslations`, which — outside a Server
 * Component using the async `getTranslations` — needs a Client
 * Component; CodeBlock already needed one either way for its copy
 * button's `useState`.
 */

/** Renders a blocked remote image as a small inert placeholder instead
 *  of a real <img> — nothing ever requests the URL. */
function BlockedImage({ alt, label }: { alt: string | undefined; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-border bg-muted px-2 py-1 text-xs text-faint-foreground">
      🖼 {alt || label}
    </span>
  );
}

export interface SafeMarkdownProps {
  content: string;
  className?: string | undefined;
}

export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  const t = useTranslations("chat");

  return (
    // `min-w-0 break-words [overflow-wrap:anywhere]`: same fix as
    // message.tsx's user bubble, applied here for model output — an
    // unbroken long token (a URL, a hash, a path with no spaces) in a
    // plain paragraph would otherwise force this whole column wider than
    // the viewport instead of wrapping. Fenced code blocks are NOT
    // affected (and must not be — line breaks inside real code would
    // corrupt it): CodeBlock's own `<pre className="overflow-x-auto">`
    // already scrolls internally instead of wrapping, so this rule only
    // ever reaches plain-text nodes (p/li/blockquote/inline code).
    // `w-full`: needed for the same reason as message.tsx's user-bubble
    // wrapper (see its comment) — this div is CodeBlock's/the table
    // wrapper's direct parent, and it must have a stable width of its
    // own for their `w-full`/`overflow-x-auto` to resolve against
    // instead of chasing this div's own shrink-to-fit content size.
    <div className={cn("w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-[15px] leading-[1.65] text-foreground", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, title, children }) => (
            <a
              href={href}
              title={title}
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              {children}
            </a>
          ),
          img: ({ alt }) => <BlockedImage alt={alt} label={t("remoteImageBlocked")} />,
          code: ({ className: codeClassName, children }) => {
            // rehype-highlight only adds a className to the <code> inside
            // a fenced block (e.g. "language-python hljs") — a plain
            // inline `code span` never gets one. That's the signal
            // react-markdown v9 gives for "which kind of code is this"
            // (the old `inline` prop was removed in v9's rewrite).
            if (!codeClassName) {
              return (
                <code className="rounded-[4px] bg-muted px-[5px] py-px font-mono text-[13px] text-accent-foreground">
                  {children}
                </code>
              );
            }
            // Fenced block — rendered plain here; the `pre` override
            // below discards this element and rebuilds it inside
            // CodeBlock, reading className/children back off it.
            return <code className={codeClassName}>{children}</code>;
          },
          pre: ({ children }) => {
            // Unwraps react-markdown's default <pre><code>…</code></pre>
            // and re-wraps with CodeBlock's head bar (language label +
            // copy button) instead. CodeBlock supplies its own <pre>, so
            // this must NOT also render one — that would nest <pre>
            // inside <pre>, invalid HTML. Only fenced blocks ever reach
            // `pre` at all, so there's no inline-code case to handle here.
            const child = React.isValidElement(children) ? children : null;
            const childProps = (child?.props ?? {}) as {
              className?: string;
              children?: React.ReactNode;
            };
            return <CodeBlock className={childProps.className}>{childProps.children}</CodeBlock>;
          },
          // `list-disc`/`list-decimal`: Tailwind's preflight reset sets
          // `list-style: none` on every `ul`/`ol` globally, so without
          // these the markers have no shape to render at all — `li`'s
          // own `marker:text-primary` only sets marker COLOR, it doesn't
          // re-enable a marker that preflight already turned off. This
          // is what made bullets/numbers disappear entirely (both here
          // and on the assistant side, which used the same override —
          // just less noticed there).
          ul: ({ children }) => <ul className="mt-2 list-disc ps-5 first:mt-0">{children}</ul>,
          ol: ({ children }) => <ol className="mt-2 list-decimal ps-5 first:mt-0">{children}</ol>,
          li: ({ children }) => <li className="mt-1 marker:text-primary">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mt-2 border-s-2 border-border ps-3 text-muted-foreground first:mt-0">
              {children}
            </blockquote>
          ),
          // unicode-bidi: plaintext on bare `p` is already global (see
          // styles/index.css) — this override only adds paragraph
          // spacing, which react-markdown otherwise renders with no
          // margin at all (no `prose` class is used here, unlike
          // legal-doc-view.tsx, so nothing else supplies it).
          p: ({ children }) => <p className="mt-2 first:mt-0">{children}</p>,
          // GFM tables (remark-gfm) render as a plain `<table>` with no
          // override at all before this patch — a `<table>` does not
          // shrink to fit its parent the way text does; the browser's
          // table layout algorithm widens it to fit the widest cell's
          // content, ignoring the column's available width. That is a
          // SEPARATE overflow source from the min-w-0/break-words chain
          // fixed in message.tsx/message-list.tsx/chat-view.tsx (Patch
          // v3) — this table.tsx/tr/td override give the table its own
          // horizontally-scrolling wrapper instead, the same pattern
          // CodeBlock already uses for `<pre>`, so a wide table scrolls
          // internally instead of widening the page.
          // Same shrink-to-fit hazard `code-block.tsx`'s wrapper had
          // (see message.tsx's `isUser` comment): a `<table>` always
          // widens to its widest cell regardless of any wrapper, so
          // this outer scroll container needs its OWN explicit
          // `min-w-0 max-w-full` — without it, inside the user bubble's
          // shrink-to-fit column this div had nothing forcing it to
          // respect the 86% cap either, so it grew to the table's full
          // width instead of scrolling internally.
          table: ({ children }) => (
            <div className="mt-2 min-w-0 max-w-full overflow-x-auto first:mt-0">
              <table className="w-full border-collapse text-start">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
          tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
          th: ({ children }) => (
            <th className="whitespace-nowrap px-3 py-1.5 text-start font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="px-3 py-1.5">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
