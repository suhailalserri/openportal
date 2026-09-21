"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/markdown/code-block.tsx
 *
 * Fenced code block — head bar (language label + copy button) over the
 * `<pre><code>` rehype-highlight already produced (see
 * safe-markdown.tsx's `pre` override, which is what renders this).
 *
 * Visual spec ported 1:1 from docs/design/design-preview.html's
 * `.code-block` / `.code-block-head` / `.copy-btn` rules (around line
 * 320), colors mapped onto this app's semantic tokens rather than
 * copied as raw hex — same approach styles/theme.css's own header
 * comment describes for everything else in this design system:
 *   --bg-inset       → bg-muted
 *   --hairline        → border-border
 *   --hairline-strong → border-input
 *   --text-faint      → text-faint-foreground
 *   --text-muted      → text-muted-foreground
 *   --signal (done state) → text-success
 * The source's asymmetric head-bar padding (`6px 8px 6px 12px`) is
 * simplified to a symmetric `px-3 py-1.5` here — avoids a physical-only
 * arbitrary-padding value for a cosmetic difference nobody would notice.
 *
 * Rule 2 (FRONTEND_REBUILD_PLAN.md §3): code stays LTR regardless of
 * document direction. `dir="ltr"` here is belt-and-suspenders on top of
 * styles/index.css's global `pre, code, kbd { direction: ltr; ... }`
 * rule — the CSS property fixes rendering; the attribute also fixes
 * browser selection/copy-paste behavior, which the CSS property alone
 * does not.
 */

/** Recursively joins text out of a React node tree — needed because
 *  rehype-highlight's output isn't a plain string by the time it reaches
 *  us here, it's already a tree of `<span className="hljs-*">` tokens.
 *  This is what the copy button actually copies. */
function getNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return getNodeText(props.children);
  }
  return "";
}

/** rehype-highlight puts the language on the <code> element as
 *  "language-python hljs" — pulls just "python" back out for the head
 *  bar's label. A plain ``` fence with no language hint has no
 *  className at all, so this falls back to "text". */
function extractLanguage(className: string | undefined): string {
  const match = /language-(\S+)/.exec(className ?? "");
  return match?.[1] ?? "text";
}

export interface CodeBlockProps {
  /** The highlighted <code> element's own className, as extracted from
   *  react-markdown's `pre` override (e.g. "language-python hljs"). */
  className?: string | undefined;
  children?: React.ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const t = useTranslations("chat");
  const [copied, setCopied] = React.useState(false);
  const language = extractLanguage(className);
  const text = React.useMemo(() => getNodeText(children), [children]);

  const handleCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div dir="ltr" className="mt-2.5 overflow-hidden rounded-[10px] border border-input">
      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-1.5 font-mono text-[11.5px] text-faint-foreground">
        <span>{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "rounded-[6px] px-2 py-0.5 font-mono text-[11.5px] transition-colors hover:bg-border hover:text-foreground",
            copied && "text-success"
          )}
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="overflow-x-auto bg-muted p-3">
        <code
          className={cn(className, "bg-transparent p-0 text-[13px] leading-[1.6] text-muted-foreground")}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}
