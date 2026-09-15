"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CreditCard, TriangleAlert, CircleAlert } from "lucide-react";
import { formatCredits } from "@/lib/utils";
import { LOW_BALANCE_THRESHOLD } from "@ai-platform/config";

interface BalanceWidgetProps { locale: string }

export function BalanceWidget({ locale }: BalanceWidgetProps) {
  const t = useTranslations();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await fetch("/api/balance");
        if (!res.ok) { setCredits(0); return; }
        const data = await res.json() as { credits: number };
        setCredits(typeof data.credits === "number" ? data.credits : 0);
      } catch {
        setCredits(0);
      }
    }
    fetchBalance();
    const id = setInterval(fetchBalance, 30_000);
    return () => clearInterval(id);
  }, []);

  if (credits === null) {
    return <div className="h-9 w-full bg-slate-800 animate-pulse rounded-xl" />;
  }

  const isLow  = credits > 0 && credits < LOW_BALANCE_THRESHOLD;
  const isZero = credits <= 0;
  const Icon   = isZero ? CircleAlert : isLow ? TriangleAlert : CreditCard;

  return (
    <Link href={`/${locale}/billing`}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors w-full
        ${isZero ? "status-error border border-red-800/60 hover:bg-red-900/30"
          : isLow  ? "status-warning border border-amber-800/60 hover:bg-amber-900/30"
          : "bg-slate-800/60 text-slate-300 border border-slate-700 hover:bg-slate-800"}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span dir="ltr" className="tabular-nums">{formatCredits(credits, locale)}</span>
      <span className="text-xs opacity-70">{t("balance.unit")}</span>
    </Link>
  );
}
