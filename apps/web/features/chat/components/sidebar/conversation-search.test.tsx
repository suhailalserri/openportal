import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ConversationSearch } from "./conversation-search";

/**
 * apps/web/features/chat/components/sidebar/conversation-search.test.tsx
 *
 * Phase 4d. Same SSR-render approach as components/markdown/
 * safe-markdown.test.tsx (see that file's header comment for why:
 * vitest.config.ts runs environment: "node", no jsdom/@testing-library —
 * `renderToStaticMarkup` needs neither and asserts on the resulting HTML
 * string). `ConversationSearch` is the one sidebar piece that's actually
 * reachable this way: it is a plain controlled input with no hooks
 * beyond `useTranslations` and no data dependency, unlike
 * `conversation-sidebar.tsx` (calls `useConversations`, which calls
 * `useSession`/`trpc` — real network/auth hooks this sandbox has no
 * mock for and no established `vi.mock` precedent to follow; see
 * docs/frontend/BRANCH_AND_CI_NOTES.md's 4d entry for that gap stated
 * plainly rather than papered over with a fabricated mock).
 *
 * What this test can and cannot prove: it confirms the component
 * renders without throwing under next-intl with the REAL en.json
 * `chat.searchConversations` string (catching a typo'd/missing message
 * key at test time, the same value i18n-parity's build-time check would
 * also catch, doubled up here since this is the one sidebar file that
 * CAN run it), the search icon and input are present with matching
 * aria-label/placeholder text, and the `ps-9` logical-padding class
 * (Rule 2) survives render. It does NOT prove onChange fires correctly
 * on a real keystroke (renderToStaticMarkup renders once and stops —
 * no event dispatch, no live DOM to type into) — that class of
 * interaction bug is preview-only, flagged the same way in the phase's
 * "not verified" notes.
 */

const WEB_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

function loadChatMessages(): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf-8");
  return (JSON.parse(raw) as { chat: Record<string, unknown> }).chat;
}

function renderSearch(value: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ chat: loadChatMessages() }}>
      <ConversationSearch value={value} onChange={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("ConversationSearch (SSR render)", () => {
  it("renders without throwing, with the real en.json searchConversations string", () => {
    const html = renderSearch("");
    expect(html).toContain("Search conversations");
  });

  it("renders the controlled value into the input", () => {
    const html = renderSearch("trip");
    expect(html).toContain('value="trip"');
  });

  it("uses logical start-padding (ps-9), not a physical pl-9, per Rule 2", () => {
    const html = renderSearch("");
    expect(html).toContain("ps-9");
    expect(html).not.toMatch(/class="[^"]*\bpl-9\b/);
  });

  it("gives the input an aria-label matching its placeholder (both from the same key)", () => {
    const html = renderSearch("");
    expect(html).toContain('aria-label="Search conversations"');
    expect(html).toContain('placeholder="Search conversations"');
  });
});
