import { Check, Minus, X } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";

/**
 * apps/web/features/landing/components/comparison-cards.tsx
 *
 * Phase 3.3+ (redesign). Replaces components/comparison-table.tsx: same
 * five factual rows, same three columns, presented as three side-by-side
 * cards with the "us" column visually lifted (gold-tinted border, soft
 * glow, primary-coloured title). Nothing here is a named-competitor
 * pricing claim — all five rows are qualitative check/x/partial, same
 * as the table it replaces.
 *
 * Zero new i18n keys: reuses `comparison.rows.*`, `comparison.us`,
 * `comparison.subscriptions`, `comparison.singleProvider` — the same
 * strings the table used.
 */

type Cell = "yes" | "no" | "partial";

interface Row {
  key: string;
  us: Cell;
  subs: Cell;
  single: Cell;
}

const ROWS: readonly Row[] = [
  { key: "payPerUse", us: "yes", subs: "no", single: "no" },
  { key: "multipleModels", us: "yes", subs: "partial", single: "no" },
  { key: "noSubscription", us: "yes", subs: "no", single: "partial" },
  { key: "arabicUi", us: "yes", subs: "partial", single: "no" },
  { key: "oneAccount", us: "yes", subs: "no", single: "yes" },
];

function CellIcon({ value }: { value: Cell }) {
  if (value === "yes") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (value === "no") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <X className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Minus className="size-3" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}

export async function ComparisonCards({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  const columns: Array<{
    id: "us" | "subs" | "single";
    title: string;
    highlighted: boolean;
    getValue: (row: Row) => Cell;
  }> = [
    {
      id: "us",
      title: t("comparison.us"),
      highlighted: true,
      getValue: (row) => row.us,
    },
    {
      id: "subs",
      title: t("comparison.subscriptions"),
      highlighted: false,
      getValue: (row) => row.subs,
    },
    {
      id: "single",
      title: t("comparison.singleProvider"),
      highlighted: false,
      getValue: (row) => row.single,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {columns.map((col) => (
        <div
          key={col.id}
          className={cn(
            "relative overflow-hidden rounded-[16px] border p-6",
            col.highlighted
              ? "border-primary/40 bg-gradient-to-b from-primary/[0.06] to-card shadow-[0_20px_60px_-24px_var(--color-primary)]"
              : "border-border bg-card",
          )}
        >
          {col.highlighted ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[15%] top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
            />
          ) : null}

          <h3
            className={cn(
              "text-[16px] font-semibold tracking-tight",
              col.highlighted ? "text-primary" : "text-foreground",
            )}
          >
            {col.title}
          </h3>

          <ul className="mt-5 flex flex-col gap-3">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-start gap-3">
                <CellIcon value={col.getValue(row)} />
                <span
                  className={cn(
                    "text-[13px] leading-snug",
                    col.getValue(row) === "yes"
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {t(`comparison.rows.${row.key}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}