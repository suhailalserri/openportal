"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

interface Transaction {
  id: string; type: string; amount: number; balanceAfter: number;
  description: string; modelId?: string; createdAt: string;
}

export default function BillingPage() {
  const { data: models = [] } = trpc.models.list.useQuery();
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [credits, setCredits]    = useState<number | null>(null);
  const [code,    setCode]       = useState("");
  const [loading, setLoading]    = useState(false);
  const [txns,    setTxns]       = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const captchaConfigured = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, []);

  async function fetchBalance() {
    const res  = await fetch("/api/balance");
    const data = await res.json() as { credits: number };
    setCredits(data.credits);
  }

  async function fetchTransactions() {
    setTxLoading(true);
    try {
      const res  = await fetch("/api/transactions?limit=20");
      const data = await res.json() as { items: Transaction[] };
      setTxns(data.items ?? []);
    } finally {
      setTxLoading(false);
    }
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    if (captchaConfigured && !turnstileToken) {
      toast.error(t("auth.errors.captchaRequired"));
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), turnstileToken }),
      });
      const data = await res.json() as { success: boolean; message: string; error?: string };
      if (data.success) {
        toast.success(data.message);
        setCode("");
        fetchBalance();
        fetchTransactions();
      } else {
        const errorKey = `redeem.errors.${data.error ?? "GENERIC"}`;
        toast.error(t(errorKey as Parameters<typeof t>[0]) ?? data.message);
      }
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      // Token is single-use whether the attempt succeeded or failed —
      // always force a fresh challenge for the next submission.
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
      setLoading(false);
    }
  }

  const txTypeVariant = (type: string): "success" | "error" | "blue" | "default" => {
    if (type === "redeem" || type === "admin_credit" || type === "payment" || type === "referral_bonus") return "success";
    if (type === "usage_debit" || type === "admin_debit") return "error";
    return "default";
  };

  return (
    <div className="min-h-screen bg-[#0F172A] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white">{t("nav.billing")}</h1>

        {/* Balance card */}
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-slate-400 text-sm mb-2">{t("balance.current")}</p>
            {credits === null ? (
              <Skeleton className="h-16 w-48 mx-auto" />
            ) : (
              <div className="flex items-baseline justify-center gap-3">
                <span className="text-6xl font-bold text-white">{formatCredits(credits, locale)}</span>
                <span className="text-2xl text-slate-400">{t("balance.unit")}</span>
              </div>
            )}
            {credits !== null && credits <= 0 && (
              <p className="text-red-400 text-sm mt-3 animate-fade-in">{t("balance.zeroMessage")}</p>
            )}
          </CardContent>
        </Card>

        {/* Redeem code */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{t("redeem.title")}</h2>
            <p className="text-sm text-slate-400">{t("redeem.description")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRedeem} className="space-y-3">
              <div className="flex gap-3">
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder={t("redeem.placeholder")}
                  dir="ltr"
                  maxLength={32}
                  className="flex-1 bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                             text-white placeholder-slate-500 focus:outline-none focus:border-blue-500
                             text-sm font-mono tracking-wider"
                />
                <Button type="submit" loading={loading} disabled={!code.trim() || (captchaConfigured && !turnstileToken)}>
                  {t("redeem.button")}
                </Button>
              </div>
              <TurnstileWidget
                locale={locale}
                resetKey={turnstileResetKey}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
              />
            </form>
          </CardContent>
        </Card>

        {/* Model pricing */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{t("models.pricing")}</h2>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-start px-6 py-3 text-slate-400 font-medium">النموذج</th>
                  <th className="text-start px-4 py-3 text-slate-400 font-medium">{t("models.priceInput")}</th>
                  <th className="text-start px-4 py-3 text-slate-400 font-medium">{t("models.priceOutput")}</th>
                  <th className="text-start px-4 py-3 text-slate-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-white">
                      <span className="me-2">{m.badge}</span>{m.displayNameAr}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono">{m.creditsPerKInput}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono">{m.creditsPerKOutput}</td>
                    <td className="px-4 py-3">
                      <Badge variant={m.tier === "premium" ? "warning" : "blue"}>
                        {t(`models.${m.tier}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 text-xs text-slate-500">{t("models.perThousand")}</p>
          </div>
        </Card>

        {/* Transaction history */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{t("balance.history")}</h2>
          </CardHeader>
          <div>
            {txLoading ? (
              <div className="p-6 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : txns.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">{t("balance.noHistory")}</p>
            ) : (
              txns.map(tx => (
                <div key={tx.id}
                  className="flex items-center justify-between px-6 py-4 border-b border-slate-800 last:border-0">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant={txTypeVariant(tx.type)}>
                        {t(`balance.types.${tx.type}` as Parameters<typeof t>[0])}
                      </Badge>
                      {tx.modelId && (
                        <span className="text-xs text-slate-500">
                          {models.find(m => m.id === tx.modelId)?.displayNameAr ?? tx.modelId}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{formatDate(tx.createdAt, locale)}</p>
                  </div>
                  <div className="text-end">
                    <p className={`font-mono font-semibold ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {tx.amount > 0 ? "+" : ""}{formatCredits(Math.abs(tx.amount), locale)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCredits(tx.balanceAfter, locale)} {t("balance.unit")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
