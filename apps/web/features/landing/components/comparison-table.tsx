import { getTranslations } from "next-intl/server";

import { Check, X, Minus } from "lucide-react";

/**
 * apps/web/features/landing/components/comparison-table.tsx
 *
 * Phase 3.3. A short, static feature-comparison table (this platform vs.
 * "multiple subscriptions" vs. "a single provider's own app") to reinforce
 * the hero's "no multiple subscriptions, no technical complexity" claim
 * with something scannable rather than only prose.
 *
 * CONTENT NOTE: rows are our own product's real, factual capabilities
 * (pay-per-use, multiple models, Arabic UI) — not named-competitor
 * pricing or claims, so nothing here needs the "competitor prices are
 * still yours to approve" gate from this phase's plan; that gate applies
 * to the calculator/pricing table's real numbers, which this component
 * does not contain. Purely qualitative (check/x/partial), no figures.
 */

type Cell = "yes" | "no" | "partial";

interface ComparisonRow {
  key: string;
  us: Cell;
  subscriptions: Cell;
  singleProvider: Cell;
}

const ROWS: ComparisonRow[] = [
  { key: "payPerUse", us: "yes", subscriptions: "no", singleProvider: "no" },
  { key: "multipleModels", us: "yes", subscriptions: "partial", singleProvider: "no" },
  { key: "noSubscription", us: "yes", subscriptions: "no", singleProvider: "partial" },
  { key: "arabicUi", us: "yes", subscriptions: "partial", singleProvider: "no" },
  { key: "oneAccount", us: "yes", subscriptions: "no", singleProvider: "yes" },
];

function CellIcon({ value }: { value: Cell }) {
  if (value === "yes") return <Check className="mx-auto size-4 text-success" aria-hidden />;
  if (value === "no") return <X className="mx-auto size-4 text-destructive" aria-hidden />;
  return <Minus className="mx-auto size-4 text-muted-foreground" aria-hidden />;
}

export async function ComparisonTable({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <div className="overflow-x-auto rounded-[16px] border border-border">
      <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
        <thead className="border-b border-input bg-card">
          <tr>
            <th className="px-4 py-3 text-start font-semibold text-foreground">{t("comparison.feature")}</th>
            <th className="px-4 py-3 text-center font-semibold text-primary">{t("comparison.us")}</th>
            <th className="px-4 py-3 text-center font-semibold text-muted-foreground">
              {t("comparison.subscriptions")}
            </th>
            <th className="px-4 py-3 text-center font-semibold text-muted-foreground">
              {t("comparison.singleProvider")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-foreground">{t(`comparison.rows.${row.key}`)}</td>
              <td className="px-4 py-3">
                <CellIcon value={row.us} />
              </td>
              <td className="px-4 py-3">
                <CellIcon value={row.subscriptions} />
              </td>
              <td className="px-4 py-3">
                <CellIcon value={row.singleProvider} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
