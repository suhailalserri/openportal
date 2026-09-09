"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatCredits } from "@/lib/utils";
import { LOW_BALANCE_THRESHOLD } from "@ai-platform/config";

interface BalanceWidgetProps { locale: string }

export function BalanceWidget({ locale }: BalanceWidgetProps) {
  const t = useTranslations();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const res  = await fetch("/api/balance");
        const data = await res.json() as { credits: number };
        setCredits(data.credits);
      } catch { /* ignore */ }
    }
    fetchBalance();
    const id = setInterval(fetchBalance, 30_000);
    return () => clearInterval(id);
  }, []);

  if (credits === null) {
    return <div className="h-8 w-24 bg-slate-700/50 animate-pulse rounded-lg" />;
  }

  const isLow  = credits > 0 && credits < LOW_BALANCE_THRESHOLD;
  const isZero = credits <= 0;

  return (
    <Link href={`/${locale}/billing`}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors
        ${isZero ? "bg-red-900/30 text-red-400 border border-red-800 hover:bg-red-900/50"
          : isLow  ? "bg-amber-900/30 text-amber-400 border border-amber-800 hover:bg-amber-900/50"
          : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"}`}>
      <span className="text-base">{isZero ? "🔴" : isLow ? "⚠️" : "💳"}</span>
      <span dir="ltr">{formatCredits(credits, locale)}</span>
      <span className="text-xs opacity-70">{t("balance.unit")}</span>
    </Link>
  );
}
