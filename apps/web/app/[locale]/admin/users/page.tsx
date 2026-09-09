"use client";
import { useState, useEffect } from "react";
import { useParams }           from "next/navigation";
import Link                    from "next/link";
import { toast }               from "sonner";
import { Card }                from "@/components/ui/card";
import { Badge }               from "@/components/ui/badge";
import { Button }              from "@/components/ui/button";
import { Skeleton }            from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/utils";

interface UserRow {
  id: string; email: string; displayName: string | null;
  role: string; status: string; tier: string;
  isFraudFlagged: boolean; createdAt: string; lastSeenAt: string | null;
}

interface BalanceRow { credits: number }

export default function AdminUsersPage() {
  const { locale } = useParams<{ locale: string }>();
  const [users,   setUsers]   = useState<(UserRow & { balance?: BalanceRow })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/users");
      const data = await res.json() as { items: (UserRow & { balance?: BalanceRow })[] };
      setUsers(data.items ?? []);
    } finally { setLoading(false); }
  }

  async function suspendUser(userId: string, suspend: boolean) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: suspend ? "suspended" : "active" }),
    });
    toast.success(suspend ? "تم تعليق الحساب" : "تم إعادة تفعيل الحساب");
    loadUsers();
  }

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const statusVariant = (s: string): "success" | "error" | "warning" =>
    s === "active" ? "success" : s === "suspended" ? "error" : "warning";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">المستخدمون</h1>
        <span className="text-sm text-slate-400">{users.length} مستخدم</span>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="بحث بالبريد الإلكتروني أو الاسم..."
        className="w-full max-w-md bg-[#1E293B] border border-slate-600 rounded-xl
                   px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-start px-6 py-3 font-medium">المستخدم</th>
                <th className="text-start px-4 py-3 font-medium">الرصيد</th>
                <th className="text-start px-4 py-3 font-medium">الحالة</th>
                <th className="text-start px-4 py-3 font-medium">الفئة</th>
                <th className="text-start px-4 py-3 font-medium">تاريخ التسجيل</th>
                <th className="text-start px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1,2,3,4,5].map(i => (
                    <tr key={i} className="border-b border-slate-800">
                      {[1,2,3,4,5,6].map(j => (
                        <td key={j} className="px-4 py-4">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map(user => (
                  <tr key={user.id}
                    className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-white flex items-center gap-2">
                          {user.displayName ?? "—"}
                          {user.isFraudFlagged && <span className="text-red-400 text-xs">🚨</span>}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-300">
                      {user.balance ? formatCredits(user.balance.credits, locale) : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(user.status)}>
                        {user.status === "active" ? "نشط"
                          : user.status === "suspended" ? "معلق" : "بانتظار التأكيد"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={user.tier === "premium" ? "warning" : "default"}>
                        {user.tier}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">
                      {formatDate(user.createdAt, locale)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/${locale}/admin/users/${user.id}`}
                          className="text-xs text-blue-400 hover:underline">تفاصيل</Link>
                        <button
                          onClick={() => suspendUser(user.id, user.status === "active")}
                          className={`text-xs hover:underline ${user.status === "active" ? "text-red-400" : "text-emerald-400"}`}>
                          {user.status === "active" ? "تعليق" : "تفعيل"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
