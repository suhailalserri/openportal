"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CalculatorView, MessageSizeId } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/hero-calculator.tsx
 *
 * Compact version of PayPerUseCalculator, tuned for the hero's right
 * column. Same data contract (`CalculatorView`, all strings/numbers
 * precomputed server-side — Rule 1) and same "select between precomputed
 * results, never derive a number" discipline; only the layout is smaller.
 *
 * Differences from PayPerUseCalculator:
 *  - No BorderBeam (too heavy inside a hero; the section further down
 *    still has it if you want to reuse this widget's sibling there).
 *  - No disclaimer line (kept short — the deep section still carries it).
 *  - Result block is the visual centre instead of a big bar. The bar is
 *    still there, under the number, but as a secondary signal.
 *
 * Fallback: renders nothing if `view` is null. The caller is expected to
 * have already handled the null case (no calculator = no models or no
 * packages, per build-landing-data.ts).
 */
export function HeroCalculator({ view }: { view: CalculatorView }) {
  const t = useTranslations("landing");
  const [modelId, setModelId] = useState(view.defaultModelId);
  const [sizeId, setSizeId] = useState<MessageSizeId>(
    view.sizes.find((s) => s.id === "medium")?.id ?? view.sizes[0]?.id ?? "short",
  );

  const model = view.models.find((m) => m.id === modelId) ?? view.models[0];
  const result = model?.results[sizeId];
  if (!model || !result) return null;

  const isReassuring = result.reassuring;
  const barColor = isReassuring
    ? "bg-gradient-to-r from-primary to-chart-1"
    : "bg-gradient-to-r from-warning to-destructive";

  const messagesLabel =
    result.messages === null
      ? t("calculator.unlimited")
      : result.messages.toLocaleString("en-US");

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-border bg-gradient-to-b from-card to-card/60 p-6 shadow-2 sm:p-7">
      {/* Top hairline accent */}
      <div
        aria-hidden="true"
        className="absolute inset-x-[15%] top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
      />

      {/* Header */}
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
          {t("calculator.heading", { budget: view.budgetLabel })}
        </h3>
        <span className="shrink-0 font-mono text-[12px] font-medium text-primary">
          {view.budgetLabel} YER
        </span>
      </div>

      {/* Controls */}
      <div className="mb-5 grid gap-3">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="hero-calc-model"
            className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {t("calculator.modelLabel")}
          </label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger id="hero-calc-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                  {m.isFree ? ` — ${t("calculator.free")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            {t("calculator.sizeLabel")}
          </span>
          <div
            role="radiogroup"
            aria-label={t("calculator.sizeLabel")}
            className="flex gap-1 rounded-[10px] border border-input bg-muted p-1"
          >
            {view.sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sizeId === s.id}
                onClick={() => setSizeId(s.id)}
                className={cn(
                  "flex-1 rounded-[7px] px-2 py-1.5 text-[12px] font-medium transition-colors",
                  sizeId === s.id
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`calculator.size.${s.id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-[14px] border border-border bg-background/60 p-5 text-center">
        <p className="text-[11px] text-muted-foreground">
          {t("heroCalc.thatIsRoughly")}
        </p>
        <p className="mt-1 text-[44px] leading-none font-semibold tracking-tight">
          <span className="text-[24px] text-muted-foreground">≈</span>{" "}
          <span className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent">
            {messagesLabel}
          </span>
        </p>
        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
          {t("heroCalc.messagesOn", { model: model.name })}
        </p>

        {/* Balance bar */}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              barColor,
            )}
            style={{ width: `${result.remainingPercent}%` }}
            role="progressbar"
            aria-valuenow={Math.round(result.remainingPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Two small stats */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[10px] border border-border bg-background/40 px-3 py-2.5">
          <p className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">
            {t("heroCalc.perMessage")}
          </p>
          <p className="mt-0.5 font-mono text-[13px] font-medium text-foreground">
            {result.yerPerMessage} YER
          </p>
        </div>
        <div className="rounded-[10px] border border-border bg-background/40 px-3 py-2.5">
          <p className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">
            {t("heroCalc.chatLeft", { turns: view.chatTurns })}
          </p>
          <p
            className={cn(
              "mt-0.5 font-mono text-[13px] font-medium",
              isReassuring ? "text-success" : "text-warning",
            )}
          >
            {result.remainingYer} YER
          </p>
        </div>
      </div>

      {/* Foot — one line, honesty-gated */}
      <div className="mt-4 border-t border-border pt-3 text-center">
        <p
          className={cn(
            "text-[11px] leading-snug",
            isReassuring ? "text-success" : "text-muted-foreground",
          )}
        >
          {isReassuring
            ? t("calculator.reassuringLine")
            : t("calculator.plainCostLine")}
        </p>
      </div>
    </div>
  );
}