"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationParams } from "../../types";
import { PARAM_LIMITS } from "../../lib/chat-params-storage";
import { parseParam, paramToText, type ParamParse } from "../../lib/param-input";

/**
 * apps/web/features/chat/components/composer/parameters-panel.tsx
 *
 * Phase 4c. Controlled panel for temperature / top_p / max_tokens /
 * system prompt. The PARENT owns the committed values and their
 * persistence (see hooks/use-chat-params.ts); this component owns only
 * the in-progress TEXT of each field.
 *
 * WHY LOCAL DRAFT TEXT: a half-typed value ("0." on the way to "0.7", or
 * "9" on the way to "0.9") must not be rejected on every keystroke or
 * clobber the last good stored value. Each field keeps its raw string,
 * parses it on change, and only calls `onChange` with a value when the
 * text parses as valid or unset; an invalid draft shows an inline error
 * and leaves the committed param untouched.
 *
 * WHICH PARAMS PERSIST WHERE (also in lib/chat-params-storage.ts): the
 * three numeric params persist client-side per conversation; the system
 * prompt persists SERVER-side via PATCH /api/conversations/[id] (B1).
 * This component is agnostic — it just reports changes.
 */
export interface ParametersPanelProps {
  params: ConversationParams;
  onParamsChange: (next: ConversationParams) => void;
  systemPrompt: string;
  onSystemPromptChange: (next: string) => void;
  /** Selected model's `maxOutputTokens`. The server clamps max_tokens to
   *  it anyway, so the panel refuses anything above it up front instead
   *  of letting the user believe a larger value took effect. */
  maxOutputTokens: number | undefined;
  disabled?: boolean;
  className?: string;
}

type Field = "temperature" | "topP" | "maxTokens";

const SYSTEM_PROMPT_MAX = 20_000; // mirrors chat.schema.ts systemPrompt .max(20_000)

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

  const maxTokensCeiling = Math.min(
    PARAM_LIMITS.maxTokens.max,
    maxOutputTokens ?? PARAM_LIMITS.maxTokens.max,
  );

  // Raw text per field, seeded from the committed value.
  const [text, setText] = React.useState<Record<Field, string>>({
    temperature: paramToText(params.temperature),
    topP: paramToText(params.topP),
    maxTokens: paramToText(params.maxTokens),
  });
  const [errors, setErrors] = React.useState<Record<Field, ParamParse | undefined>>({
    temperature: undefined,
    topP: undefined,
    maxTokens: undefined,
  });

  // Re-seed when the committed params change from OUTSIDE (switching to a
  // different conversation, or Reset). Compared by value so our own
  // onChange round-trip doesn't fight the user's typing.
  const lastSeeded = React.useRef(params);
  React.useEffect(() => {
    const prev = lastSeeded.current;
    if (
      prev.temperature !== params.temperature ||
      prev.topP !== params.topP ||
      prev.maxTokens !== params.maxTokens
    ) {
      lastSeeded.current = params;
      // Only overwrite a field whose committed value differs from what
      // its current text parses to — preserves an in-progress "0." draft.
      setText((cur) => ({
        temperature: reseed(cur.temperature, params.temperature, PARAM_LIMITS.temperature),
        topP: reseed(cur.topP, params.topP, PARAM_LIMITS.topP),
        maxTokens: reseed(cur.maxTokens, params.maxTokens, { min: 1, max: maxTokensCeiling }, true),
      }));
      setErrors({ temperature: undefined, topP: undefined, maxTokens: undefined });
    }
  }, [params, maxTokensCeiling]);

  const limitsFor = (field: Field) =>
    field === "temperature"
      ? PARAM_LIMITS.temperature
      : field === "topP"
        ? PARAM_LIMITS.topP
        : { min: 1, max: maxTokensCeiling };

  const handleField = (field: Field, raw: string) => {
    setText((cur) => ({ ...cur, [field]: raw }));
    const parsed = parseParam(raw, limitsFor(field), { integer: field === "maxTokens" });
    setErrors((cur) => ({ ...cur, [field]: parsed.kind === "invalid" ? parsed : undefined }));
    if (parsed.kind === "invalid") return; // keep the last good committed value
    onParamsChange({ ...params, [field]: parsed.kind === "valid" ? parsed.value : null });
  };

  const handleReset = () => {
    setText({ temperature: "", topP: "", maxTokens: "" });
    setErrors({ temperature: undefined, topP: undefined, maxTokens: undefined });
    onParamsChange({ temperature: null, topP: null, maxTokens: null });
    onSystemPromptChange("");
  };

  const anySet =
    params.temperature !== null ||
    params.topP !== null ||
    params.maxTokens !== null ||
    systemPrompt.length > 0;

  const errorText = (field: Field): string | undefined => {
    const e = errors[field];
    if (!e || e.kind !== "invalid") return undefined;
    const lim = limitsFor(field);
    if (e.reason === "out_of_range") return t("errors.outOfRange", { min: lim.min, max: lim.max });
    if (e.reason === "not_integer") return t("errors.notInteger");
    return t("errors.notANumber");
  };

  const numericField = (field: Field, label: string, hint: string, placeholder: string) => {
    const id = `${baseId}-${field}`;
    const err = errorText(field);
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={text[field]}
          onChange={(e) => handleField(field, e.target.value)}
          placeholder={placeholder}
          disabled={disabled ?? false}
          aria-invalid={err ? true : undefined}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
        />
        <p
          id={`${id}-hint`}
          role={err ? "alert" : undefined}
          className={cn("text-[11.5px]", err ? "text-destructive" : "text-faint-foreground")}
        >
          {err ?? hint}
        </p>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="grid gap-4 sm:grid-cols-3">
        {numericField("temperature", t("temperature"), t("temperatureHint"), t("default"))}
        {numericField("topP", t("topP"), t("topPHint"), t("default"))}
        {numericField(
          "maxTokens",
          t("maxTokens"),
          t("maxTokensHint", { max: maxTokensCeiling.toLocaleString("en-US") }),
          t("default"),
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${baseId}-system`}>{t("systemPrompt")}</Label>
        <Textarea
          id={`${baseId}-system`}
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          maxLength={SYSTEM_PROMPT_MAX}
          placeholder={t("systemPromptPlaceholder")}
          disabled={disabled ?? false}
          rows={3}
          className="min-h-[72px] resize-y"
        />
        <p className="text-[11.5px] text-faint-foreground">{t("systemPromptHint")}</p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={(disabled ?? false) || !anySet}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}

/** Keep the user's current text if it already represents the new committed
 *  value (e.g. "0." vs 0, or "0.70" vs 0.7); otherwise show the committed one. */
function reseed(
  currentText: string,
  committed: number | null,
  limits: { min: number; max: number },
  integer = false,
): string {
  const parsed = parseParam(currentText, limits, { integer });
  const currentValue = parsed.kind === "valid" ? parsed.value : parsed.kind === "unset" ? null : undefined;
  return currentValue === committed ? currentText : paramToText(committed);
}
