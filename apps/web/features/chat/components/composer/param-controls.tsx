"use client";

import * as React from "react";
import { Info, Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  canStepMaxTokens,
  formatSliderValue,
  sliderFraction,
  snapToStep,
  stepMaxTokens,
  type SliderSpec,
} from "../../lib/param-slider";

/**
 * apps/web/features/chat/components/composer/param-controls.tsx
 *
 * Phase 4c (rework). The controls inside the parameters panel:
 *  - <ParamSlider>  temperature, top_p
 *  - <ParamStepper> max response length (a slider over 1…16,384+ is
 *                   unusable on a phone; − / + with a model-sized step is)
 *
 * Presentational and prop-driven (no next-intl hooks): the panel passes
 * every label in, so these render in a plain vitest `renderToStaticMarkup`.
 *
 * VALUE MODEL. `value: number | null`. `null` = "not set, provider default,
 * omit from the request". A native range input can't be empty, so while
 * `null` the thumb rests at `defaultPosition` (dimmed, the readout says
 * "Default") and the fill is hidden; the first real move produces a
 * number; the reset button returns to `null`. Pure logic in
 * lib/param-slider.ts.
 *
 * THE ⓘ BUTTON toggles the hint INLINE (not a hover tooltip — hover
 * doesn't exist on a phone). The hint is always in the DOM and linked with
 * `aria-describedby`; when closed it is `sr-only`, so screen-reader users
 * always get it and sighted users get it on tap.
 *
 * SLIDER DIRECTION: the track wrapper is `dir="ltr"` on purpose. It is a
 * numeric scale, and every number in this UI is LTR (0 on the left, like
 * the readouts). Labels and the ⓘ/reset buttons still follow the page
 * direction.
 *
 * NATIVE `<input type="range">` rather than a Radix Slider: not a
 * dependency, and adding one needs a lockfile regeneration that this
 * workflow can't do offline. It gets keyboard, touch, screen-reader and
 * form semantics for free. Only the thumb is styled (the tracks are
 * transparent and drawn by sibling divs) because styling the track
 * pseudo-elements differs per engine and can't be checked without a
 * browser; the thumb needs only the two vendor selectors.
 */

const THUMB = 20; // px — 20px keeps a comfortable touch target on the thumb

function InfoButton({
  label,
  open,
  controls,
  onClick,
}: {
  label: string;
  open: boolean;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-faint-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        open && "text-accent-foreground",
      )}
    >
      <Info className="size-4" aria-hidden />
    </button>
  );
}

function ResetButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint-foreground outline-none transition-colors hover:not-disabled:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
    >
      <RotateCcw className="size-3.5" aria-hidden />
    </button>
  );
}

export interface ParamSliderProps {
  label: string;
  hint: string;
  value: number | null;
  spec: SliderSpec;
  /** Where the thumb rests while `value` is null. */
  defaultPosition: number;
  defaultLabel: string;
  /** aria-label for the ⓘ button (already includes the param name). */
  infoLabel: string;
  /** aria-label for the reset button (already includes the param name). */
  resetLabel: string;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  className?: string;
}

export function ParamSlider({
  label,
  hint,
  value,
  spec,
  defaultPosition,
  defaultLabel,
  infoLabel,
  resetLabel,
  onChange,
  disabled,
  className,
}: ParamSliderProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const [infoOpen, setInfoOpen] = React.useState(false);

  const isDefault = value === null;
  const shown = value ?? defaultPosition;
  const fraction = sliderFraction(shown, spec);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        <InfoButton
          label={infoLabel}
          open={infoOpen}
          controls={hintId}
          onClick={() => setInfoOpen((o) => !o)}
        />
        <span className="ms-auto flex items-center gap-1">
          <output
            htmlFor={id}
            dir="ltr"
            className={cn(
              "text-[13px] tabular-nums",
              isDefault ? "text-faint-foreground" : "font-medium text-foreground",
            )}
          >
            {isDefault ? defaultLabel : formatSliderValue(shown, spec.step)}
          </output>
          {!isDefault ? (
            <ResetButton label={resetLabel} onClick={() => onChange(null)} disabled={disabled ?? false} />
          ) : null}
        </span>
      </div>

      <div dir="ltr" className="relative h-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border"
        />
        {!isDefault ? (
          <div
            aria-hidden
            className="pointer-events-none absolute start-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            // Fill ends at the thumb's CENTRE: the thumb travels
            // (100% − THUMB) of the track, offset by half its width.
            style={{ width: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${fraction})` }}
          />
        ) : null}
        <input
          id={id}
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={shown}
          disabled={disabled ?? false}
          aria-describedby={hintId}
          onChange={(e: { currentTarget: { value: string } }) => onChange(snapToStep(Number(e.currentTarget.value), spec))}
          className={cn(
            "absolute inset-0 size-full cursor-pointer touch-pan-y appearance-none rounded-full bg-transparent outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed disabled:opacity-45",
            "[&::-webkit-slider-runnable-track]:h-6 [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:mt-0.5 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-1",
            "[&::-moz-range-track]:h-6 [&::-moz-range-track]:bg-transparent",
            "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:shadow-1",
            isDefault
              ? "[&::-webkit-slider-thumb]:bg-muted-foreground [&::-moz-range-thumb]:bg-muted-foreground"
              : "[&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:bg-primary",
          )}
        />
      </div>

      <p
        id={hintId}
        className={cn("text-[11.5px] leading-snug text-muted-foreground", !infoOpen && "sr-only")}
      >
        {hint}
      </p>
    </div>
  );
}

export interface ParamStepperProps {
  label: string;
  hint: string;
  value: number | null;
  /** The selected model's max output tokens (already capped). */
  ceiling: number;
  defaultLabel: string;
  infoLabel: string;
  resetLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  className?: string;
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground outline-none transition-[background-color,color,transform] hover:not-disabled:bg-border hover:not-disabled:text-foreground active:not-disabled:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

export function ParamStepper({
  label,
  hint,
  value,
  ceiling,
  defaultLabel,
  infoLabel,
  resetLabel,
  decreaseLabel,
  increaseLabel,
  onChange,
  disabled,
  className,
}: ParamStepperProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const [infoOpen, setInfoOpen] = React.useState(false);
  const off = disabled ?? false;
  const isDefault = value === null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-1">
        <span id={id} className="text-[13px] font-medium text-foreground">
          {label}
        </span>
        <InfoButton
          label={infoLabel}
          open={infoOpen}
          controls={hintId}
          onClick={() => setInfoOpen((o) => !o)}
        />
        <div
          role="group"
          aria-labelledby={id}
          aria-describedby={hintId}
          className="ms-auto flex items-center gap-1.5"
        >
          {!isDefault ? <ResetButton label={resetLabel} onClick={() => onChange(null)} disabled={off} /> : null}
          <StepButton
            label={decreaseLabel}
            onClick={() => onChange(stepMaxTokens(value, -1, ceiling))}
            disabled={off || !canStepMaxTokens(value, -1, ceiling)}
          >
            <Minus aria-hidden />
          </StepButton>
          <output
            dir="ltr"
            aria-live="polite"
            className={cn(
              "min-w-[3.75rem] text-center text-[13px] tabular-nums",
              isDefault ? "text-faint-foreground" : "font-medium text-foreground",
            )}
          >
            {isDefault ? defaultLabel : value.toLocaleString("en-US")}
          </output>
          <StepButton
            label={increaseLabel}
            onClick={() => onChange(stepMaxTokens(value, 1, ceiling))}
            disabled={off || !canStepMaxTokens(value, 1, ceiling)}
          >
            <Plus aria-hidden />
          </StepButton>
        </div>
      </div>
      <p
        id={hintId}
        className={cn("text-[11.5px] leading-snug text-muted-foreground", !infoOpen && "sr-only")}
      >
        {hint}
      </p>
    </div>
  );
}
