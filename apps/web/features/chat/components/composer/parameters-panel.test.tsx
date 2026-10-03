import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONVERSATION_PARAMS, type ConversationParams } from "../../types";
import { ParametersPanel } from "./parameters-panel";

/**
 * P6.6. Same SSR approach as conversation-search.test.tsx (node environment, no jsdom): proves what
 * is RENDERED (control present or absent, active level, real en.json keys), not taps.
 */
const WEB_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

function messages(locale: "en" | "ar"): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf-8");
  return (JSON.parse(raw) as { chat: Record<string, unknown> }).chat;
}

function render(props: { supportsReasoning?: boolean; params?: ConversationParams; locale?: "en" | "ar" }): string {
  const locale = props.locale ?? "en";
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ chat: messages(locale) }}>
      <ParametersPanel
        params={props.params ?? DEFAULT_CONVERSATION_PARAMS}
        onParamsChange={() => {}}
        maxOutputTokens={8192}
        {...(props.supportsReasoning === undefined ? {} : { supportsReasoning: props.supportsReasoning })}
      />
    </NextIntlClientProvider>,
  );
}

describe("ParametersPanel, P6.6 reasoning control", () => {
  it("is absent for a model without the reasoning flag (the default)", () => {
    expect(render({})).not.toContain("reasoning-effort");
    expect(render({ supportsReasoning: false })).not.toContain("reasoning-effort");
  });

  it("is present for a reasoning model with Default, Low, Medium and High", () => {
    const html = render({ supportsReasoning: true });
    expect(html).toContain("reasoning-effort");
    for (const label of ["Reasoning", "Default", "Low", "Medium", "High"]) expect(html).toContain(label);
  });

  it("marks only the stored level as pressed", () => {
    const html = render({ supportsReasoning: true, params: { ...DEFAULT_CONVERSATION_PARAMS, reasoningEffort: "high" } });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("marks Default as pressed when nothing is chosen", () => {
    const html = render({ supportsReasoning: true });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("renders in Arabic with real keys", () => {
    expect(render({ supportsReasoning: true, locale: "ar" })).toContain("التفكير");
  });

  it("does not show a search switch while the control is hidden", () => {
    expect(render({ supportsReasoning: true })).not.toContain('role="switch"');
  });
});
