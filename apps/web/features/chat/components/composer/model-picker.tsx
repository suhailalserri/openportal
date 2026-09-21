"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatLatency,
  formatTokenSize,
  modelDisplayName,
  type ChatModel,
} from "../../lib/model-selection";

/**
 * apps/web/features/chat/components/composer/model-picker.tsx
 *
 * Phase 4c. Presentational — takes the already-fetched model list and the
 * selected id as props (data fetching lives in ../../hooks/use-chat-models
 * so this file is renderable in a fixture with no tRPC).
 *
 * WHY THE TRIGGER RE-RENDERS THE NAME ITSELF: the shared `SelectItem`
 * (components/ui/select.tsx) wraps ALL its children in Radix's
 * `ItemText`, and Radix mirrors an item's `ItemText` into the closed
 * trigger. Putting the rich detail (context, price, latency) inside the
 * item would dump every line of it into the trigger. So each item's
 * children are ONLY the compact name, and `<SelectValue>` is given an
 * explicit child (below) — the rich detail for the selected model is
 * shown in a separate summary row under the trigger instead. The shared
 * select.tsx is deliberately not modified (out of this phase's scope).
 *
 * PRICES: `creditsPerKInput/Output` are DISPLAY credits per 1K tokens, not
 * micro-credits — never pass them through formatCredits() (see
 * lib/model-selection.ts's header). Formatted here with a plain
 * `toLocaleString` and the `latn` numbering system, matching
 * lib/format.ts's "Western digits in Arabic locale" convention.
 */
export interface ModelPickerProps {
  models: readonly ChatModel[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Disable while a response is streaming: switching model mid-stream
   *  would change which model the NEXT message uses, but the user would
   *  reasonably expect it to apply to the message being generated. */
  disabled?: boolean;
  className?: string;
}

function formatPrice(n: number, locale: "ar" | "en"): string {
  return n.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
    numberingSystem: "latn",
    maximumFractionDigits: 2,
  });
}

export function ModelPicker({
  models,
  selectedId,
  onSelect,
  disabled,
  className,
}: ModelPickerProps) {
  const t = useTranslations("chat");
  const tm = useTranslations("models");
  const locale = useLocale() === "ar" ? "ar" : "en";

  const selected = models.find((m) => m.id === selectedId);

  if (models.length === 0) {
    return (
      <p className={cn("text-[12.5px] text-muted-foreground", className)} role="status">
        {tm("noneAvailable")}
      </p>
    );
  }

  const latency = selected ? formatLatency(selected.avgResponseTimeMs) : null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Select value={selectedId ?? ""} onValueChange={onSelect} disabled={disabled ?? false}>
        <SelectTrigger size="sm" aria-label={t("selectModel")} className="min-w-[180px]">
          <SelectValue placeholder={t("selectModel")}>
            {selected ? (
              <span className="flex items-center gap-1.5">
                <span>{modelDisplayName(selected, locale)}</span>
                {selected.badge ? <span aria-hidden>{selected.badge}</span> : null}
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {modelDisplayName(m, locale)}
              {m.badge ? ` ${m.badge}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected ? (
        <dl
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint-foreground"
          aria-label={modelDisplayName(selected, locale)}
        >
          <div className="flex items-center gap-1">
            <dt className="sr-only">{tm("pricing")}</dt>
            <Badge variant={selected.tier === "premium" ? "default" : "secondary"}>
              {selected.tier === "premium" ? tm("premium") : tm("standard")}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <dt>{tm("contextWindow")}</dt>
            <dd className="text-muted-foreground">{formatTokenSize(selected.contextWindow)}</dd>
          </div>
          <div className="flex items-center gap-1" title={tm("perThousand")}>
            <dt>{tm("priceInput")}</dt>
            <dd className="text-muted-foreground">{formatPrice(selected.creditsPerKInput, locale)}</dd>
            <dt>{tm("priceOutput")}</dt>
            <dd className="text-muted-foreground">{formatPrice(selected.creditsPerKOutput, locale)}</dd>
          </div>
          <div className="flex items-center gap-1" title={tm("latencyTooltip")}>
            <dt className="sr-only">{tm("latencyTooltip")}</dt>
            {/* null → em dash. avgResponseTimeMs is null until the first
                gateway sync records a channel test (see models.ts). */}
            <dd className="text-muted-foreground">{latency ?? "—"}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
