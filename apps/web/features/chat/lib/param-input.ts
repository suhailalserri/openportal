/**
 * apps/web/features/chat/lib/param-input.ts
 *
 * Phase 4c. Pure parsing/validation for the parameter panel's text
 * inputs. Kept out of the component because number-input handling is
 * where the real bugs are, and vitest here has no DOM.
 *
 * The panel uses `type="text" inputMode="decimal"` rather than
 * `type="number"`: a native number input reports an in-progress value
 * like "0." or "-" as an EMPTY string (its `.value` is "" until it
 * parses), which would make typing "0.7" repeatedly reset the field.
 * With a text input we own the raw string and only parse on change.
 *
 * Result union, not `number | null`: the panel must tell three states
 * apart —
 *   "unset"   the field is empty → send nothing, provider default applies
 *   "invalid" the text is not a valid number / out of range → show an
 *             error and DO NOT update the stored param
 *   "valid"   a usable number
 * A plain `null` can't distinguish "unset" from "invalid".
 */
export type ParamParse =
  | { kind: "unset" }
  | { kind: "invalid"; reason: "not_a_number" | "out_of_range" | "not_integer" }
  | { kind: "valid"; value: number };

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII. Users on Arabic
 *  keyboards can type these, and `Number("٠٫٧")` is NaN. Also maps the
 *  Arabic decimal separator (٫) to "." and the Arabic comma (،) too. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066B\u066C\u060C]/g, ".")
    .trim();
}

export function parseParam(
  raw: string,
  limits: { min: number; max: number },
  opts: { integer?: boolean } = {},
): ParamParse {
  const text = normalizeDigits(raw);
  if (text === "") return { kind: "unset" };
  // Strict shape: optional digits, optional single ".digits". Rejects "1e3",
  // "0x10", "Infinity", "1,000", "--1", and (unlike Number()) "" / " ".
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return { kind: "invalid", reason: "not_a_number" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid", reason: "not_a_number" };
  if (opts.integer && !Number.isInteger(value)) return { kind: "invalid", reason: "not_integer" };
  if (value < limits.min || value > limits.max) return { kind: "invalid", reason: "out_of_range" };
  return { kind: "valid", value };
}

/** Text to show in an input for a stored param. `null` → empty string. */
export function paramToText(value: number | null): string {
  return value === null ? "" : String(value);
}
