"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { formatCredits, formatDate } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const STATUS_TABS = ["pending", "approved", "rejected"] as const;

export default function AdminManualPaymentsPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const isAr = locale === "ar";
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<typeof STATUS_TABS[number]>("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: rows = [], isLoading } = trpc.admin.listManualPayments.useQuery({ status });

  const approveMutation = trpc.admin.approveManualPayment.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      utils.admin.listManualPayments.invalidate();
    },
    onError: (e) => toast.error(e.message || t("errors.generic")),
  });

  const rejectMutation = trpc.admin.rejectManualPayment.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      utils.admin.listManualPayments.invalidate();
      setRejectingId(null);
      setRejectReason("");
    },
    onError: (e) => toast.error(e.message || t("errors.generic")),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="font-display text-2xl text-slate-50">{isAr ? "طلبات التحويل اليدوي" : "Manual Transfer Claims"}</h1>

      <div className="flex gap-2">
        {STATUS_TABS.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              status === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}>
            {s === "pending" ? (isAr ? "بانتظار المراجعة" : "Pending")
              : s === "approved" ? (isAr ? "معتمدة" : "Approved")
              : (isAr ? "مرفوضة" : "Rejected")}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-white">
            {rows.length} {isAr ? "طلب" : "claim(s)"}
          </h2>
        </CardHeader>
        <div>
          {isLoading && <div className="text-center text-slate-500 py-8 text-sm">…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="text-center text-slate-500 py-8 text-sm">
              {isAr ? "لا توجد طلبات" : "No claims"}
            </div>
          )}
          {rows.map((row) => (
            <div key={row.claim.id} className="px-6 py-4 border-b border-slate-800 last:border-0 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-blue-400 text-sm" dir="ltr">{row.claim.referenceCode}</span>
                    <Badge variant="blue">{isAr ? row.methodNameAr : row.methodName}</Badge>
                  </div>
                  <p className="text-white text-sm">{row.userEmail ?? row.claim.userId}</p>
                  <p className="text-slate-400 text-xs">
                    {isAr ? row.packageNameAr : row.packageName} — {row.packagePriceYer?.toLocaleString()} YER
                  </p>
                </div>
                <p className="text-xs text-slate-500 whitespace-nowrap">{formatDate(row.claim.createdAt, locale)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 bg-[#17130F] rounded-lg p-3">
                {row.claim.submittedTxRef && (
                  <p><span className="text-slate-500">{isAr ? "مرجع التحويل: " : "Tx ref: "}</span>
                    <span className="font-mono text-slate-200" dir="ltr">{row.claim.submittedTxRef}</span></p>
                )}
                {row.claim.senderPhone && (
                  <p><span className="text-slate-500">{isAr ? "هاتف المرسل: " : "Sender phone: "}</span>
                    <span className="font-mono text-slate-200" dir="ltr">{row.claim.senderPhone}</span></p>
                )}
                {row.claim.senderName && (
                  <p><span className="text-slate-500">{isAr ? "اسم المرسل: " : "Sender name: "}</span>
                    <span className="text-slate-200">{row.claim.senderName}</span></p>
                )}
                {row.claim.notes && (
                  <p className="col-span-2"><span className="text-slate-500">{isAr ? "ملاحظات: " : "Notes: "}</span>
                    <span className="text-slate-200">{row.claim.notes}</span></p>
                )}
                {row.claim.screenshotUrl && (
                  <a href={row.claim.screenshotUrl} target="_blank" rel="noreferrer"
                    className="col-span-2 text-blue-400 hover:underline">
                    {isAr ? "عرض لقطة الشاشة" : "View screenshot"}
                  </a>
                )}
              </div>

              {row.claim.status === "pending" && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" loading={approveMutation.isPending}
                    onClick={() => approveMutation.mutate({ claimId: row.claim.id })}>
                    {isAr ? "اعتماد" : "Approve"}
                  </Button>
                  {rejectingId === row.claim.id ? (
                    <>
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder={isAr ? "سبب الرفض" : "Rejection reason"}
                        className="flex-1 bg-[#17130F] border border-slate-600 rounded-xl px-3 py-2 text-sm text-white
                                   placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <Button size="sm" variant="danger" loading={rejectMutation.isPending}
                        disabled={!rejectReason.trim()}
                        onClick={() => rejectMutation.mutate({ claimId: row.claim.id, reason: rejectReason.trim() })}>
                        {isAr ? "تأكيد الرفض" : "Confirm reject"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                        {isAr ? "إلغاء" : "Cancel"}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setRejectingId(row.claim.id)}>
                      {isAr ? "رفض" : "Reject"}
                    </Button>
                  )}
                </div>
              )}

              {row.claim.status === "rejected" && row.claim.rejectionReason && (
                <p className="text-xs text-red-400">
                  {isAr ? "سبب الرفض: " : "Rejection reason: "}{row.claim.rejectionReason}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
