"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

/** Settings page's referral section — code, share link, and simple stats. */
export function ReferralCard({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const { data, isLoading } = trpc.user.getReferralStats.useQuery();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  if (isLoading || !data?.referralCode) return null; // nothing to show pre-signup-hook rollout

  const link = typeof window !== "undefined"
    ? `${window.location.origin}/${locale}/auth/register?ref=${data.referralCode}`
    : "";

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      toast.success(isAr ? "تم النسخ" : "Copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(isAr ? "تعذر النسخ" : "Couldn't copy");
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-white">{isAr ? "برنامج الإحالة" : "Referral program"}</h2>
        <p className="text-sm text-slate-400">
          {isAr
            ? "شارك رابطك — عندما يكمل صديقك أول عملية شحن تحصل على رصيد مكافأة."
            : "Share your link — when a friend completes their first purchase, you earn bonus credits."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#17130F] border border-slate-700 rounded-xl px-4 py-3
                          font-mono text-white text-sm tracking-wider" dir="ltr">
            {data.referralCode}
          </div>
          <Button type="button" variant="secondary" onClick={() => copy(data.referralCode!, "code")}>
            {copied === "code" ? (isAr ? "تم!" : "Copied!") : (isAr ? "نسخ الكود" : "Copy code")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#17130F] border border-slate-700 rounded-xl px-4 py-3
                          text-slate-400 text-xs truncate" dir="ltr">
            {link}
          </div>
          <Button type="button" variant="secondary" onClick={() => copy(link, "link")}>
            {copied === "link" ? (isAr ? "تم!" : "Copied!") : (isAr ? "نسخ الرابط" : "Copy link")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-[#17130F] rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-white">{data.referredCount}</p>
            <p className="text-xs text-slate-500 mt-1">{isAr ? "أصدقاء مسجلون" : "Friends signed up"}</p>
          </div>
          <div className="bg-[#17130F] rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{formatCredits(data.totalBonusMicroCredits, locale)}</p>
            <p className="text-xs text-slate-500 mt-1">{isAr ? "رصيد مكتسب" : "Credits earned"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
