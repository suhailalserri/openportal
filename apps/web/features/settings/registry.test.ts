import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SETTINGS_SECTIONS, getVisibleSections } from "./registry";

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function loadSettingsNavMessages(locale: "ar" | "en"): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf-8");
  const parsed = JSON.parse(raw) as { settings?: { nav?: Record<string, unknown> } };
  return parsed.settings?.nav ?? {};
}

describe("settings registry integrity", () => {
  it("ids are unique", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every visible section has a component", () => {
    for (const section of getVisibleSections()) {
      expect(section.component, `${section.id} is visible but has no component`).not.toBeNull();
    }
  });

  it.each(["ar", "en"] as const)("every titleKey exists in messages/%s.json (settings.nav.*)", (locale) => {
    const nav = loadSettingsNavMessages(locale);
    for (const section of SETTINGS_SECTIONS) {
      expect(typeof nav[section.titleKey], `settings.nav.${section.titleKey} (${section.id})`).toBe("string");
    }
  });

  it("7.1 ships profile and security as the only visible sections", () => {
    expect(getVisibleSections().map((s) => s.id).sort()).toEqual(["profile", "security"]);
  });
});
