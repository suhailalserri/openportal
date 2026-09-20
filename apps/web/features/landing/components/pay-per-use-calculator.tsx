"use client";

import * as React from "react";
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
 * apps/web/features/landing/components/pay-per-use-calculator.tsx
 *
 * Phase 3.3 — "How far does 1,000 YER go?" This is the component this
 * whole sub-feature exists for: several people mistook pay-per-use for
 * "one chat drains the whole balance", and this section is the direct
 * answer, made concrete instead of asserted.
 *
 * RULE 1, enforced by construction: every number shown (messages count,
 * per-message YER, worked-example chat cost, remaining balance, remaining
 * %) is already sitting in `view.models[x].results[size]`
 * (CalculatorResultView — types.ts), computed server-side by
 * lib/pricing.ts + lib/build-landing-data.ts. This component's only
 * state is WHICH model and WHICH size are selected — two indices into
 * data that already exists. There is no formula, no multiplication, no
 * percentage math anywhere in this file.
 *
 * HONESTY GATE: `result.reassuring` was decided on the server
 * (pricing.ts isReassuring — "leaves at least 50% of the balance").
 * Only when true does the UI say the reassuring line; otherwise it
 * states the plain worked-example cost. This directly answers the
 * friends-thought-it-was-a-scam concern without ever overstating it for
 * an expensive model / long chat combination where it would be false.
 */

export function PayPerUseCalculator({ view }: { view: CalculatorView }) {
  const t = useTranslations("landing");
  const [modelId, setModelId] = React.useState(view.defaultModelId);
  const [sizeId, setSizeId] = React.useState<MessageSizeId>(view.sizes[0]?.id ?? "short");

  const model = view.models.find((m) => m.id === modelId) ?? view.models[0];
  const result = model?.results[sizeId];

  if (!model || !result) return null;

  return (
    <div className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <label className="t-small mb-1.5 block">{t("calculator.modelLabel")}</label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger>
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

        <div className="flex-1">
          <label className="t-small mb-1.5 block">{t("calculator.sizeLabel")}</label>
          <div className="flex gap-1.5" role="radiogroup" aria-label={t("calculator.sizeLabel")}>
            {view.sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sizeId === s.id}
                onClick={() => setSizeId(s.id)}
                className={cn(
                  "flex-1 rounded-[9px] border px-3 py-2 text-[12.5px] font-medium transition-colors",
                  sizeId === s.id
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-input bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`calculator.size.${s.id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {model.isFree ? (
        <p className="t-body text-center text-success">{t("calculator.modelIsFree")}</p>
      ) : (
        <>
          <div className="mb-4 text-center">
            <p className="t-h2 text-primary">
              {result.messages === null
                ? t("calculator.unlimited")
                : t("calculator.aboutNMessages", { count: result.messages })}
            </p>
            <p className="t-small mt-1">
              {t("calculator.perMessageRate", { price: result.yerPerMessage })}
            </p>
          </div>

          {/* The draining balance bar — purely presentational, driven by
              the server-computed remainingPercent (0-100). */}
          <div className="mb-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${result.remainingPercent}%` }}
                role="progressbar"
                aria-valuenow={Math.round(result.remainingPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("calculator.remainingBalanceLabel")}
              />
            </div>
            <div className="mt-1.5 flex justify-between t-caption">
              <span>{t("calculator.chatCost", { turns: view.chatTurns, price: result.chatYer })}</span>
              <span>{t("calculator.remaining", { price: result.remainingYer })}</span>
            </div>
          </div>

          <p className={cn("t-small text-center", result.reassuring ? "text-success" : "text-muted-foreground")}>
            {result.reassuring ? t("calculator.reassuringLine") : t("calculator.plainCostLine")}
          </p>
        </>
      )}
    </div>
  );
}
