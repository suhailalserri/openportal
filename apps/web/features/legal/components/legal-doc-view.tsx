import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * apps/web/features/legal/components/legal-doc-view.tsx
 *
 * Renders a legal document's markdown as read-only prose. Rule 7
 * (FRONTEND_REBUILD_PLAN.md §3): "Model output is untrusted. No
 * rehype-raw, no dangerouslySetInnerHTML..." — these documents are not
 * model output, they're our own committed markdown, but the same
 * component conventions apply anyway: react-markdown's default pipeline
 * never executes embedded HTML, so a doc author can't accidentally (or a
 * future compromised dependency can't easily) inject a script tag that
 * renders on every visitor's browser. remark-gfm only adds tables/strike/
 * autolinks — no additional trust surface.
 *
 * Server Component: no hooks, no "use client" — this can render entirely
 * on the server, same as the page that wraps it.
 */
export function LegalDocView({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div
      className={cn(
        // prose defaults from @tailwindcss/typography (already a devDependency).
        // dir="ltr" would be wrong here — unlike code blocks, legal prose is
        // ordinary bidi text and should follow the page's own direction.
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Every link in these documents is either an internal anchor or
          // a mailto/https link to a real contact address — rel is set
          // unconditionally rather than sniffed per-href, matching Rule 7's
          // "links get rel=noopener noreferrer" for any rendered markdown.
          a: ({ href, children, ...props }) => (
            <a href={href} rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
