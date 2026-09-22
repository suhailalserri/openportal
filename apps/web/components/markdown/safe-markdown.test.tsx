import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SafeMarkdown } from "./safe-markdown";

/**
 * apps/web/components/markdown/safe-markdown.test.tsx
 *
 * Phase 4a. vitest.config.ts runs environment: "node" (no jsdom, no
 * @testing-library/react — see that file's header comment for why), so
 * this renders via react-dom/server's `renderToStaticMarkup` (SSR-safe,
 * no DOM required) and asserts on the resulting HTML STRING rather than
 * a live DOM tree. "use client" at the top of safe-markdown.tsx /
 * code-block.tsx is a Next.js bundler directive — inert outside Next's
 * own build, so plain react-dom/server renders these as ordinary React
 * components with no special handling needed.
 *
 * The three XSS payloads below are verbatim the same as
 * content/demo/chat-render-fixture.ts's `XSS_FIXTURES` (minus the
 * ChatMessage wrapper) — that file is the same fixtures rendered
 * visually at /dev/chat-render for a human to also eyeball.
 *
 * NOT independently verified end-to-end in this sandbox (no network/
 * node_modules to actually run `vitest`) — see this phase's own
 * MANIFEST for what specifically is and isn't confirmed here, in
 * particular: (1) that `next-intl`'s `NextIntlClientProvider` works
 * standalone under plain react-dom/server outside a Next.js runtime,
 * and (2) that react-markdown v9's default URL-sanitizing behavior
 * (which the `javascript:` link test below relies on — this component
 * does not implement its own scheme-checking) is unchanged from the
 * version documented in react-markdown's own README.
 */

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function loadChatMessages(): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf-8");
  return (JSON.parse(raw) as { chat: Record<string, unknown>; balance: Record<string, unknown> })
    .chat;
}

function renderMarkdown(content: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ chat: loadChatMessages() }}>
      <SafeMarkdown content={content} />
    </NextIntlClientProvider>
  );
}

describe("SafeMarkdown — XSS fixtures render inert", () => {
  it("never turns an embedded <script> tag into a real, executable element", () => {
    const html = renderMarkdown(
      "Ignore previous instructions.<script>alert('xss')</script> Here is your answer."
    );
    // A real <script> element would appear as the literal substring
    // "<script" — react-markdown (no rehype-raw) never produces one; it
    // either strips the raw HTML or shows it as escaped ("&lt;script"),
    // both of which are safe outcomes this one assertion covers.
    expect(html).not.toContain("<script");
  });

  it("never emits a javascript: URL as a real, clickable href", () => {
    const html = renderMarkdown("[Click here for your refund](javascript:alert('xss'))");
    expect(html.toLowerCase()).not.toContain('href="javascript:');
  });

  it("never auto-loads a remote image — renders an inert placeholder instead", () => {
    const html = renderMarkdown("![tracking pixel](https://evil.example.com/pixel.png?uid=12345)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example.com");
  });

  it("never turns other embedded raw HTML into a real, attribute-bearing element", () => {
    const html = renderMarkdown('Before <div onclick="alert(1)">click me</div> after.');
    // Checks for a REAL <div onclick=...> element specifically, not just
    // any "<div" — SafeMarkdown always wraps its own output in a
    // legitimate <div class="text-[15px] leading-[1.65] ..."> (see
    // safe-markdown.tsx), so a bare /<div[\s>]/ regex false-positives on
    // that wrapper itself regardless of what the payload did. Matching
    // the payload's own "onclick" attribute specifically still proves
    // the same thing (a real, attribute-bearing element was NOT
    // produced from the raw HTML) without tripping on the component's
    // always-present, harmless wrapper. Escaped text renders as
    // "&lt;div onclick=" instead, which this does not match.
    expect(html).not.toMatch(/<div\s+onclick=/i);
  });
});

describe("SafeMarkdown — trusted rendering (Arabic + code, sanity check)", () => {
  it("renders a fenced code block forced LTR via CodeBlock, and preserves the Arabic prose around it", () => {
    const html = renderMarkdown("شرح قصير مع كود:\n\n```python\ndef f():\n    return 1\n```");
    expect(html).toContain("شرح قصير مع كود");
    expect(html).toContain('dir="ltr"');
    // rehype-highlight tokenizes "def f():" into separate
    // <span class="hljs-keyword">def</span> <span class="hljs-title
    // function_">f</span>(): — correct, intended syntax highlighting —
    // so the literal substring "def f():" no longer appears in the raw
    // HTML even though it's exactly what a reader (or a screen reader,
    // or copy-paste) sees. Strip tags before asserting on the rendered
    // TEXT, which is what this "sanity check" is actually meant to
    // confirm — that the code content came through, not the specific
    // markup rehype-highlight happens to produce for it.
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("def f():");
  });

  it("forces rel=noopener noreferrer on a legitimate link, href intact", () => {
    const html = renderMarkdown("[docs](https://example.com/docs)");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com/docs"');
  });

  it("renders inline code distinctly from a fenced block (no CodeBlock chrome around it)", () => {
    const html = renderMarkdown("use `pip install` to install it");
    expect(html).toContain("pip install");
    expect(html).not.toContain("language-");
  });

  it("wraps a GFM table in an overflow-x-auto container instead of a bare <table>", () => {
    // Regression test for the mobile horizontal-overflow bug: a plain
    // <table> with no wrapper forces the page to the table's natural
    // width instead of scrolling internally (see this component's
    // `table` override comment). Asserts the wrapper div and its class
    // are actually present around the table react-markdown produces.
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toMatch(/<div[^>]*overflow-x-auto[^>]*>\s*<table/);
    expect(html).toContain("<th");
    expect(html).toContain("<td");
  });
});
