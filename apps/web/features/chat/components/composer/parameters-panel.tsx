"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { REASONING_EFFORTS, type ConversationParams, type ReasoningEffort } from "../../types";
import { WEB_SEARCH_CONTROL_ENABLED } from "../../lib/request-options";
import { Switch } from "@/components/ui/switch";
import { PARAM_LIMITS } from "../../lib/chat-params-storage";
import { clampMaxTokens } from "../../lib/param-slider";
import { ParamSlider, ParamStepper } from "./param-controls";

/**
 * apps/web/features/chat/components/composer/parameters-panel.tsx
 *
 * The parameters panel that opens inline from the composer: temperature
 * and top_p as sliders, max response length as a − / + stepper. Fully
 * controlled — the PARENT owns the committed values and their persistence
 * (hooks/use-chat-params.ts).
 *
 * There used to also be a user-editable system prompt textarea here.
 * That's been removed entirely — product decision: users don't get a
 * custom system prompt. Whatever "rules" the assistant follows now come
 * from the server-owned platform/model prompts assembled in
 * gateway.service.ts, which this panel never reads, sets, or overrides.
 *
 * MAX-OUTPUT vs THE SELECTED MODEL: a stored value can exceed a
 * newly-picked smaller model's ceiling. The panel DISPLAYS the clamped
 * value (that is what the server will actually use — it clamps to the
 * model's maxOutputTokens) but does not silently rewrite stored state.
 */
export interface ParametersPanelProps {
  params: ConversationParams;
  onParamsChange: (next: ConversationParams) => void;
  /** Selected model's `maxOutputTokens`. */
  maxOutputTokens: number | undefined;
  /** P6.6. True only when the selected model carries the admin `reasoning` flag; otherwise the reasoning control is absent. */
  supportsReasoning?: boolean;
  disabled?: boolean;
  className?: string;
}

const TEMPERATURE_SPEC = { ...PARAM_LIMITS.temperature, step: 0.1 } as const;
const TOP_P_SPEC = { ...PARAM_LIMITS.topP, step: 0.05 } as const;

export function ParametersPanel({
  params,
  onParamsChange,
  maxOutputTokens,
  supportsReasoning = false,
  disabled,
  className,
}: ParametersPanelProps) {
  const t = useTranslations("chat.parameters");
  const off = disabled ?? false;

  const ceiling = Math.min(PARAM_LIMITS.maxTokens.max, maxOutputTokens ?? PARAM_LIMITS.maxTokens.max);
  const shownMaxTokens = clampMaxTokens(params.maxTokens, ceiling);

  const anySet =
    params.temperature !== null ||
    params.topP !== null ||
    params.maxTokens !== null ||
    (supportsReasoning && params.reasoningEffort !== null) ||
    (WEB_SEARCH_CONTROL_ENABLED && params.webSearch);

  const handleReset = () => {
    onParamsChange({ ...params, temperature: null, topP: null, maxTokens: null, reasoningEffort: null, webSearch: false });
  };

  const effortOptions: ReadonlyArray<{ value: ReasoningEffort | null; label: string }> = [
    { value: null, label: t("default") },
    ...REASONING_EFFORTS.map((e) => ({ value: e, label: t(`effort.${e}`) })),
  ];

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ParamSlider
        label={t("temperature")}
        hint={t("temperatureHint")}
        value={params.temperature}
        spec={TEMPERATURE_SPEC}
        defaultPosition={1}
        defaultLabel={t("default")}
        infoLabel={t("info", { label: t("temperature") })}
        resetLabel={t("resetOne", { label: t("temperature") })}
        onChange={(v) => onParamsChange({ ...params, temperature: v })}
        disabled={off}
      />
      <ParamSlider
        label={t("topP")}
        hint={t("topPHint")}
        value={params.topP}
        spec={TOP_P_SPEC}
        defaultPosition={1}
        defaultLabel={t("default")}
        infoLabel={t("info", { label: t("topP") })}
        resetLabel={t("resetOne", { label: t("topP") })}
        onChange={(v) => onParamsChange({ ...params, topP: v })}
        disabled={off}
      />
      <ParamStepper
        label={t("maxTokens")}
        hint={t("maxTokensHint", { max: ceiling.toLocaleString("en-US") })}
        value={shownMaxTokens}
        ceiling={ceiling}
        defaultLabel={t("default")}
        infoLabel={t("info", { label: t("maxTokens") })}
        resetLabel={t("resetOne", { label: t("maxTokens") })}
        decreaseLabel={t("decrease")}
        increaseLabel={t("increase")}
        onChange={(v) => onParamsChange({ ...params, maxTokens: v })}
        disabled={off}
      />

      {supportsReasoning ? (
        <div className="flex flex-col gap-2" role="group" aria-label={t("reasoning")} data-testid="reasoning-effort">
          <span className="text-sm font-medium">{t("reasoning")}</span>
          <p className="text-xs text-muted-foreground">{t("reasoningHint")}</p>
          <div className="flex gap-1.5">
            {effortOptions.map((o) => (
              <Button
                key={o.value ?? "default"}
                type="button"
                size="sm"
                variant={params.reasoningEffort === o.value ? "default" : "outline"}
                aria-pressed={params.reasoningEffort === o.value}
                disabled={off}
                onClick={() => onParamsChange({ ...params, reasoningEffort: o.value })}
                className="flex-1"
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {WEB_SEARCH_CONTROL_ENABLED ? (
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{t("webSearch")}</span>
          <Switch
            checked={params.webSearch}
            disabled={off}
            onCheckedChange={(v) => onParamsChange({ ...params, webSearch: v })}
          />
        </label>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={handleReset} disabled={off || !anySet}>
          <RotateCcw className="size-3.5" aria-hidden />
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}
