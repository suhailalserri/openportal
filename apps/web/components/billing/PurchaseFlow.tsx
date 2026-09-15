"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface Props {
  locale: string;
  onCreditsGranted: () => void; // re-fetch balance after an approved claim shows up, etc.
}

/**
 * §7.8/§7.9/§7.10 — package picker, per-method instructions, and the
 * manual-transfer claim form. Jaib needs no form here: tabweeb hands the
 * buyer an actual code, and they redeem it in the existing redeem box
 * above (`#redeem-box`) — this panel just points them there.
 */
export function PurchaseFlow({ locale, onCreditsGranted }: Props) {
  const isAr = locale === "ar";
  const { data: packages = [],  isLoading: packagesLoading } = trpc.billing.listPackages.useQuery();
  const { data: methods  = [],  isLoading: methodsLoading  } = trpc.billing.listPaymentMethods.useQuery();
  const { data: myClaims = [],  refetch: refetchClaims } = trpc.billing.myManualPayments.useQuery({ limit: 10 });

  const [packageId, setPackageId] = useState<string | null>(null);
  const [methodId,  setMethodId]  = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({ submittedTxRef: "", senderPhone: "", senderName: "", notes: "" });
  const [lastReference, setLastReference] = useState<string | null>(null);

  const submitClaim = trpc.billing.submitManualPayment.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setLastReference(res.referenceCode ?? null);
      setClaimForm({ submittedTxRef: "", senderPhone: "", senderName: "", notes: "" });
      refetchClaims();
      onCreditsGranted();
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedMethod = methods.find(m => m.id === methodId);

  function handleSubmitClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!packageId || !methodId) return;
    submitClaim.mutate({
      packageId, paymentMethodId: methodId,
      submittedTxRef: claimForm.submittedTxRef || undefined,
      senderPhone:    claimForm.senderPhone || undefined,
      senderName:     claimForm.senderName || undefined,
      notes:          claimForm.notes || undefined,
    });
  }

  function scrollToRedeemBox() {
    document.getElementById("redeem-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const claimStatusVariant = (status: string): "success" | "warning" | "error" =>
    status === "approved" ? "success" : status === "rejected" ? "error" : "warning";
  const claimStatusLabel = (status: string) => {
    if (status === "approved") return isAr ? "معتمد" : "approved";
    if (status === "rejected") return isAr ? "مرفوض" : "rejected";
    return isAr ? "قيد المراجعة" : "pending";
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-white">{isAr ? "شحن الرصيد" : "Buy credits"}</h2>
        <p className="text-sm text-slate-400">{isAr ? "الأسعار بالريال اليمني" : "Prices in Yemeni Rial"}</p>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Package picker */}
        {packagesLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {packages.map((pkg) => (
              <button key={pkg.id} onClick={() => setPackageId(pkg.id)}
                className={`text-start rounded-xl border p-4 transition-colors ${
                  packageId === pkg.id
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-700 bg-[#17130F] hover:border-slate-600"
                }`}>
                <p className="text-white font-bold">{pkg.priceYer.toLocaleString()} <span className="text-xs font-normal text-slate-400">YER</span></p>
                <p className="text-sm text-emerald-400 font-mono mt-1">{formatCredits(pkg.credits, locale)} {isAr ? "رصيد" : "credits"}</p>
              </button>
            ))}
          </div>
        )}

        {/* Payment method picker */}
        {packageId && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-300">{isAr ? "اختر طريقة الدفع" : "Choose a payment method"}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!methodsLoading && methods.map((m) => (
                <button key={m.id} onClick={() => setMethodId(m.id)}
                  className={`text-start rounded-xl border p-4 transition-colors ${
                    methodId === m.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-700 bg-[#17130F] hover:border-slate-600"
                  }`}>
                  <p className="text-white font-medium">{isAr ? m.nameAr : m.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {m.type === "jaib_voucher"
                      ? (isAr ? "كود شحن فوري عبر جيب" : "Instant voucher via Jaib")
                      : (isAr ? "تحويل يدوي + مراجعة الإدارة" : "Manual transfer + admin review")}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Jaib instructional panel — §7.9 */}
        {selectedMethod?.type === "jaib_voucher" && (
          <div className="rounded-xl border border-slate-700 bg-[#17130F] p-4 space-y-3">
            {selectedMethod.accountCode && (
              <p className="text-sm">
                <span className="text-slate-400">{isAr ? "كود الشبكة: " : "Network code: "}</span>
                <span className="font-mono text-white" dir="ltr">{selectedMethod.accountCode}</span>
              </p>
            )}
            <p className="text-sm text-slate-300 whitespace-pre-line">
              {isAr ? selectedMethod.instructionsAr : selectedMethod.instructions}
            </p>
            <Button type="button" variant="secondary" onClick={scrollToRedeemBox}>
              {isAr ? "لدي الكود بالفعل — انتقل لصندوق الاستبدال" : "I already have my code — go to redeem box"}
            </Button>
          </div>
        )}

        {/* Manual-transfer claim form — §7.10 */}
        {selectedMethod?.type === "manual_transfer" && (
          <div className="rounded-xl border border-slate-700 bg-[#17130F] p-4 space-y-4">
            {selectedMethod.accountCode && (
              <p className="text-sm">
                <span className="text-slate-400">{isAr ? "رقم المحفظة: " : "Wallet number: "}</span>
                <span className="font-mono text-white" dir="ltr">{selectedMethod.accountCode}</span>
              </p>
            )}
            <p className="text-sm text-slate-300 whitespace-pre-line">
              {isAr ? selectedMethod.instructionsAr : selectedMethod.instructions}
            </p>

            {lastReference && (
              <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 p-3">
                <p className="text-sm text-emerald-300">
                  {isAr ? "رمز المرجع الخاص بك: " : "Your reference code: "}
                  <span className="font-mono font-bold" dir="ltr">{lastReference}</span>
                </p>
                <p className="text-xs text-emerald-400/80 mt-1">
                  {isAr ? "اكتب هذا الرمز كملاحظة عند التحويل ليتمكن الفريق من مطابقته." : "Write this as your transfer note so we can match it."}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmitClaim} className="grid grid-cols-2 gap-3">
              <Input dir="ltr" label={isAr ? "رقم/مرجع التحويل" : "Transaction reference"}
                value={claimForm.submittedTxRef}
                onChange={e => setClaimForm(f => ({ ...f, submittedTxRef: e.target.value }))} />
              <Input dir="ltr" label={isAr ? "رقم هاتف المرسل" : "Sender phone"}
                value={claimForm.senderPhone}
                onChange={e => setClaimForm(f => ({ ...f, senderPhone: e.target.value }))} />
              <Input label={isAr ? "اسم المرسل" : "Sender name"}
                value={claimForm.senderName}
                onChange={e => setClaimForm(f => ({ ...f, senderName: e.target.value }))} />
              <Textarea label={isAr ? "ملاحظات (اختياري)" : "Notes (optional)"} rows={2}
                value={claimForm.notes}
                onChange={e => setClaimForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="col-span-2">
                <Button type="submit" loading={submitClaim.isPending}>
                  {isAr ? "إرسال طلب التحويل" : "Submit claim"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Buyer's claim history */}
        {myClaims.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">{isAr ? "طلباتك السابقة" : "Your claims"}</p>
            {myClaims.map((claim) => (
              <div key={claim.id} className="flex items-center justify-between rounded-lg bg-[#17130F] px-4 py-2.5 text-sm">
                <div>
                  <span className="font-mono text-slate-300" dir="ltr">{claim.referenceCode}</span>
                  <span className="text-slate-500 ms-2">{formatDate(claim.createdAt, locale)}</span>
                </div>
                <Badge variant={claimStatusVariant(claim.status)}>{claimStatusLabel(claim.status)}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
