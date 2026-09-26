"use client";

import { Sparkles } from "lucide-react";
import { ModelProvider, ProviderIcon as LobeProviderIcon } from "@lobehub/icons";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/icons/provider-icon.tsx
 *
 * Single place that turns a free-text "provider" string (from the
 * `models.provider` column — system-managed, comes straight from New
 * API's channel `type` field or a model-id prefix, see
 * model-sync.service.ts) into a real brand icon via `@lobehub/icons`.
 *
 * `@lobehub/icons` already ships everything this needs:
 *  - `ModelProvider` — an enum of every provider key it has an icon for
 *    (`ModelProvider.OpenAI === "openai"`, etc). Used both to normalize
 *    our provider strings AND to build the "pick one from the full list"
 *    admin UI (see provider-icon-picker.tsx) — so that list is always in
 *    sync with whatever providers the installed icon package supports,
 *    with nothing hand-maintained here.
 *  - `ProviderIcon` — renders by provider key string directly
 *    (`<ProviderIcon provider="openai" />`), which is exactly the shape
 *    we already store.
 *
 * ALIASES exist because the strings we actually get are NOT always the
 * library's own enum values — a New API channel's `type` (e.g. "gemini",
 * "azure_openai", "qwen") or a `model-id/prefix` split often differs from
 * the icon package's canonical key (e.g. "google", "azureai", "qwen" —
 * check against your installed version's `ModelProvider` if one of these
 * ever renders the fallback icon; the exact key set can shift between
 * @lobehub/icons versions).
 */

const ALIASES: Record<string, string> = {
  gpt: ModelProvider.OpenAI,
  azure_openai: "azureai",
  azureopenai: "azureai",
  gemini: "google",
  vertexai: "google",
  "vertex-ai": "google",
  claude: ModelProvider.Anthropic,
  llama: "meta",
  "meta-llama": "meta",
  mistralai: "mistral",
  "mistral-ai": "mistral",
  grok: "xai",
  kimi: "moonshot",
  "moonshot-ai": "moonshot",
  glm: "zhipu",
  chatglm: "zhipu",
  qwen: "qwen",
  "alibaba-cloud": "qwen",
  alibabacloud: "qwen",
  bedrock: "aws",
  amazon: "aws",
  "amazon-bedrock": "aws",
};

/** Every provider key the installed @lobehub/icons version knows about. */
const KNOWN_KEYS = new Set<string>(Object.values(ModelProvider).map((v) => String(v).toLowerCase()));

function slugify(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Best-effort match of a free-text provider string to a key
 * `@lobehub/icons`'s `ProviderIcon` understands. Returns undefined if
 * nothing plausible is found — callers should fall back to a generic
 * icon rather than guess.
 */
export function normalizeProviderKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const slug = slugify(raw);
  if (!slug) return undefined;

  if (KNOWN_KEYS.has(slug)) return slug;
  if (ALIASES[slug]) return ALIASES[slug];

  // Loose contains-match as a last resort (e.g. "openai-compatible",
  // "openai_proxy" -> "openai"; "google-ai-studio" -> "google").
  for (const key of KNOWN_KEYS) {
    if (slug.includes(key) || key.includes(slug)) return key;
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (slug.includes(alias)) return key;
  }

  return undefined;
}

export interface AppProviderIconProps {
  /** The row's stored `providerIconKey` (admin override) if set. */
  providerIconKey?: string | null | undefined;
  /** Fallback source when there's no explicit override — `models.provider`. */
  provider?: string | null | undefined;
  size?: number;
  type?: "mono" | "color";
  className?: string;
}

/**
 * Renders the right brand icon for a model row: the admin's explicit
 * `providerIconKey` wins if set, otherwise auto-detected from
 * `provider`, otherwise a generic sparkle glyph so the layout never
 * shows a broken icon.
 */
export function AppProviderIcon({
  providerIconKey,
  provider,
  size = 18,
  type = "mono",
  className,
}: AppProviderIconProps) {
  const key = normalizeProviderKey(providerIconKey) ?? normalizeProviderKey(provider);

  if (!key) {
    return (
      <Sparkles
        size={size}
        className={cn("text-muted-foreground", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <LobeProviderIcon
      provider={key}
      size={size}
      type={type}
      {...(className !== undefined ? { className } : {})}
    />
  );
}

/** One entry per provider @lobehub/icons ships — the source for the admin "pick a provider icon" list. */
export interface ProviderIconOption {
  key: string;
  label: string;
}

function humanize(pascalCaseKey: string): string {
  return pascalCaseKey
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

/**
 * All provider keys the installed @lobehub/icons version supports, for a
 * searchable picker. Nothing hand-maintained: this list grows/shrinks on
 * its own whenever the package is upgraded.
 */
export const PROVIDER_ICON_OPTIONS: ProviderIconOption[] = Object.entries(ModelProvider)
  .map(([enumKey, value]) => ({ key: String(value), label: humanize(enumKey) }))
  .sort((a, b) => a.label.localeCompare(b.label));
