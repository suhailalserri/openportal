"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationParams } from "../../types";
import { PARAM_LIMITS } from "../../lib/chat-params-storage";
import { clampMaxTokens } from "../../lib/param-slider";
import { ParamSlider, ParamStepper } from "./param-controls";

/**
 * apps/web/features/chat/components/composer/parameters-panel.tsx
 *
 * Phase 4c (rework). The parameters panel that opens inline from the
 * composer: temperature and top_p as sliders, max response length as a
 * − / + stepper, and the system prompt. Fully controlled — the PARENT owns
 * the committed values and their persistence (hooks/use-chat-params.ts).
 *
 * The previous version kept per-field draft TEXT so a half-typed "0." could
 * survive; none of that is needed once nothing is typed (the sliders and
 * stepper only ever emit valid, snapped numbers), so the text parsing
 * (lib/param-input.ts) and its error strings were removed.
 *
 * MAX-OUTPUT vs THE SELECTED MODEL: a stored value can exceed a
 * newly-picked smaller model's ceiling. The panel DISPLAYS the clamped
 * value (that is what the server will actually use — it clamps to the
 * model's maxOutputTokens) but does not silently rewrite stored state.
 */
export interface ParametersPanelProps {
  params: ConversationParams;
  onParamsChange: (next: ConversationParams) => void;
  systemPrompt: string;
  onSystemPromptChange: (next: string) => void;
  /** Selected model's `maxOutputTokens`. */
  maxOutputTokens: number | undefined;
  disabled?: boolean;
  className?: string;
}

const SYSTEM_PROMPT_MAX = 20_000; // mirrors chat.schema.ts systemPrompt .max(20_000)

const TEMPERATURE_SPEC = { ...PARAM_LIMITS.temperature, step: 0.1 } as const;
const TOP_P_SPEC = { ...PARAM_LIMITS.topP, step: 0.05 } as const;

export function ParametersPanel({
  params,
  onParamsChange,
  systemPrompt,
  onSystemPromptChange,
  maxOutputTokens,
  disabled,
  className,
}: ParametersPanelProps) {
  const t = useTranslations("chat.parameters");
  const baseId = React.useId();
  const off = disabled ?? false;

  const ceiling = Math.min(PARAM_LIMITS.maxTokens.max, maxOutputTokens ?? PARAM_LIMITS.maxTokens.max);
  const shownMaxTokens = clampMaxTokens(params.maxTokens, ceiling);

  const anySet =
    params.temperature !== null ||
    params.topP !== null ||
    params.maxTokens !== null ||
    systemPrompt.length > 0;

  const handleReset = () => {
    onParamsChange({ temperature: null, topP: null, maxTokens: null });
    onSystemPromptChange("");
  };

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${baseId}-system`}>{t("systemPrompt")}</Label>
        <Textarea
          id={`${baseId}-system`}
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          maxLength={SYSTEM_PROMPT_MAX}
          placeholder={t("systemPromptPlaceholder")}
          disabled={off}
          rows={3}
          className="min-h-[72px] resize-y"
        />
        <p className="text-[11.5px] text-faint-foreground">{t("systemPromptHint")}</p>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={handleReset} disabled={off || !anySet}>
          <RotateCcw className="size-3.5" aria-hidden />
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}
