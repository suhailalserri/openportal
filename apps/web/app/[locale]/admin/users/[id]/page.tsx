"use client";
import { useState, useEffect } from "react";
import { useParams }           from "next/navigation";
import Link                    from "next/link";
import { toast }               from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge }               from "@/components/ui/badge";
import { Button }              from "@/components/ui/button";
import { Skeleton }            from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/utils";

export default function UserDetailPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState("");
  const [reason,  setReason]  = useState("");

  useEffect(() => { loadUser(); }, [id]);

  async function loadUser() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      setData(await res.json());
    } finally { setLoading(false); }
  }

  async function adjustCredits(type: "admin_credit" | "admin_debit") {
    if (!credits || !reason) { toast.error("أدخل القيمة والسبب"); return; }
    await fetch(`/api/admin/users/${id}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseInt(credits), type, reason }),
    });
    toast.success("تم تعديل الرصيد");
    setCredits(""); setReason("");
    loadUser();
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
    </div>
  );

  const user    = data?.user;
  const balance = data?.balance;
  const txns    = data?.recentTxns ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/admin/users`} className="text-slate-400 hover:text-white">←</Link>
        <h1 className="text-2xl font-bold text-white">{user?.displayName ?? user?.email}</h1>
        {user?.isFraudFlagged && <Badge variant="error">🚨 مبلغ عنه</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Row label="البريد" value={user?.email} dir="ltr" />
            <Row label="الدور"  value={user?.role} />
            <Row label="الحالة" value={user?.status} />
            <Row label="الفئة"  value={user?.tier} />
            <Row label="تاريخ التسجيل" value={formatDate(user?.createdAt, locale)} />
            <Row label="آخر ظهور" value={user?.lastSeenAt ? formatDate(user.lastSeenAt, locale) : "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-slate-400 text-sm mb-1">الرصيد الحالي</p>
            <p className="text-4xl font-bold text-white">
              {balance ? formatCredits(balance.credits, locale) : "—"}
            </p>
            <p className="text-slate-500 text-sm mt-1">رصيد</p>
          </CardContent>
        </Card>
      </div>

      {/* Adjust Credits */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">تعديل الرصيد</h2></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <input type="number" placeholder="عدد الأرصدة" value={credits}
              onChange={e => setCredits(e.target.value)}
              className="w-32 bg-[#0F172A] border border-slate-600 rounded-xl px-3 py-2 text-white text-sm
                         focus:outline-none focus:border-blue-500" />
            <input type="text" placeholder="السبب (مطلوب)" value={reason}
              onChange={e => setReason(e.target.value)}
              className="flex-1 bg-[#0F172A] border border-slate-600 rounded-xl px-3 py-2 text-white text-sm
                         focus:outline-none focus:border-blue-500" />
            <Button variant="secondary" onClick={() => adjustCredits("admin_credit")}>+ إضافة</Button>
            <Button variant="danger"    onClick={() => adjustCredits("admin_debit")}>− خصم</Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">آخر المعاملات</h2></CardHeader>
        <div>
          {txns.map((tx: any) => (
            <div key={tx.id}
              className="flex items-center justify-between px-6 py-3 border-b border-slate-800 last:border-0">
              <div>
                <p className="text-sm text-slate-300">{tx.description ?? tx.type}</p>
                <p className="text-xs text-slate-500">{formatDate(tx.createdAt, locale)}</p>
              </div>
              <p className={`font-mono text-sm font-semibold ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {tx.amount > 0 ? "+" : ""}{formatCredits(Math.abs(tx.amount), locale)}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, dir }: { label: string; value?: string; dir?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm text-white font-medium" dir={dir}>{value ?? "—"}</span>
    </div>
  );
}
