"use client";
import { useParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Wallet, Radio, TrendingUp, Users, UserRound, Ticket, Zap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { trpc } from "@/lib/trpc";
import { formatRelativeDate } from "@/lib/utils";

interface StatCardProps { title: string; value: string; sub?: string | undefined; icon: LucideIcon; color?: string; loading?: boolean }

function StatCard({ title, value, sub, icon: Icon, color = "text-blue-400", loading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm text-slate-400">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : (
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            )}
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          </div>
          {/* Icon in its own tinted badge (bg-current/10) rather than a
              bare glyph — reads as a designed KPI card, not a label. */}
          <span className={`shrink-0 p-2.5 rounded-xl bg-slate-800 ${color}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

const TX_TYPE_BADGE: Record<string, { label: string; variant: "success" | "blue" | "warning" | "error" | "default" }> = {
  redeem:         { label: "استبدال كود",  variant: "success" },
  payment:        { label: "دفع يدوي",     variant: "success" },
  usage_debit:    { label: "استخدام",      variant: "blue" },
  admin_credit:   { label: "إضافة إدارية", variant: "warning" },
  admin_debit:    { label: "خصم إداري",    variant: "error" },
  referral_bonus: { label: "مكافأة إحالة", variant: "default" },
};

export default function AdminDashboardPage() {
  const { locale } = useParams<{ locale: string }>();

  const stats    = trpc.admin.getDashboardStats.useQuery(undefined,      { refetchInterval: 30_000 });
  const series   = trpc.admin.getRevenueTimeseries.useQuery({ days: 14 }, { refetchInterval: 60_000 });
  const models   = trpc.admin.getModelUsageBreakdown.useQuery({ days: 7 });
  const recent   = trpc.admin.getRecentTransactions.useQuery({ limit: 20 }, { refetchInterval: 20_000 });
  const channels = trpc.admin.gatewayChannels.useQuery(undefined,        { refetchInterval: 30_000 });

  const s = stats.data;
  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const fmtYer = (n: number) => `${n.toLocaleString("en-US")} ريال`;
  const fmtMargin = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">لوحة التحكم</h1>
        {stats.isFetching && <span className="text-xs text-slate-500">جارٍ التحديث…</span>}
      </div>

      {stats.error && (
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-red-400 text-sm">تعذّر تحميل إحصائيات اللوحة: {stats.error.message}</p>
        </CardContent></Card>
      )}

      {/* KPIs — today */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="الإيرادات اليوم" icon={Wallet} color="text-emerald-400" loading={stats.isLoading}
          value={s ? fmtYer(s.revenue.todayYer) : "—"}
          sub={s ? `≈ ${fmtUsd(s.revenue.today30dUsd)}` : undefined}
        />
        <StatCard
          title="تكاليف API اليوم" icon={Radio} color="text-blue-400" loading={stats.isLoading}
          value={s ? fmtUsd(s.cost.todayUsd) : "—"}
        />
        <StatCard
          title="هامش الربح اليوم" icon={TrendingUp} color="text-purple-400" loading={stats.isLoading}
          value={s ? fmtMargin(s.marginPercent.today) : "—"}
          sub={s?.marginPercent.today === null ? "لا توجد مبيعات اليوم بعد" : undefined}
        />
        <StatCard
          title="مستخدمون نشطون" icon={Users} color="text-teal-400" loading={stats.isLoading}
          value={s ? String(s.activeUsers) : "—"}
          sub="آخر 5 دقائق"
        />
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="إجمالي المستخدمين"   value={s ? String(s.totalUsers)         : "—"} icon={UserRound} color="text-slate-300" loading={stats.isLoading}
          sub={s ? `+${s.newUsersToday} اليوم` : undefined} />
        <StatCard title="أكواد مستخدمة اليوم" value={s ? String(s.codesRedeemedToday) : "—"} icon={Ticket} color="text-slate-300" loading={stats.isLoading} />
        <StatCard title="طلبات اليوم"         value={s ? String(s.requestsToday)      : "—"} icon={Zap} color="text-slate-300" loading={stats.isLoading} />
      </div>

      {/* Revenue vs Cost chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">الإيرادات مقابل التكلفة — آخر 14 يوماً</h2>
            {s && (
              <span className="text-xs text-slate-400">
                هامش 30 يوم: <span className="text-purple-400 font-semibold">{fmtMargin(s.marginPercent.last30d)}</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {series.isLoading ? <Skeleton className="h-[220px] w-full" /> : <RevenueChart data={series.data ?? []} />}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Channel health */}
        <Card>
          <CardHeader><h2 className="font-semibold text-white">صحة القنوات</h2></CardHeader>
          <CardContent>
            {channels.isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : channels.error ? (
              <p className="text-red-400 text-sm">تعذّر الاتصال بالبوابة: {channels.error.message}</p>
            ) : (channels.data ?? []).length === 0 ? (
              <p className="text-slate-500 text-sm">لا توجد قنوات مُعرّفة بعد</p>
            ) : (
              <div className="space-y-3">
                {(channels.data ?? []).map(ch => (
                  <div key={ch.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${ch.status === 1 ? "bg-emerald-400" : "bg-red-400"} animate-pulse`} />
                      <span className="text-sm text-slate-300">{ch.name}</span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {ch.responseTime > 0 ? `${ch.responseTime}ms` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model usage breakdown */}
        <Card>
          <CardHeader><h2 className="font-semibold text-white">الاستخدام حسب النموذج — آخر 7 أيام</h2></CardHeader>
          <CardContent>
            {models.isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (models.data ?? []).length === 0 ? (
              <p className="text-slate-500 text-sm">لا يوجد استخدام مسجّل بعد</p>
            ) : (
              <div className="space-y-2">
                {(models.data ?? []).map(m => (
                  <div key={m.modelId} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                    <span className="text-sm text-slate-300 font-mono" dir="ltr">{m.modelId}</span>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>{m.requests.toLocaleString()} طلب</span>
                      <span className="text-emerald-400 font-mono" dir="ltr">{m.creditsSpent.toFixed(1)} رصيد</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">آخر المعاملات</h2></CardHeader>
        <CardContent className="p-0">
          {recent.isLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (recent.data ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm p-6">لا توجد معاملات بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-slate-500 text-xs border-b border-slate-800">
                    <th className="px-6 py-2 font-medium text-start">النوع</th>
                    <th className="px-6 py-2 font-medium text-start">المستخدم</th>
                    <th className="px-6 py-2 font-medium text-start">النموذج</th>
                    <th className="px-6 py-2 font-medium text-start">المبلغ</th>
                    <th className="px-6 py-2 font-medium text-start">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent.data ?? []).map(tx => {
                    const badge = TX_TYPE_BADGE[tx.type] ?? { label: tx.type, variant: "default" as const };
                    return (
                      <tr key={tx.id} className="border-b border-slate-800/50 last:border-0">
                        <td className="px-6 py-2.5"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                        <td className="px-6 py-2.5 text-slate-300 truncate max-w-[180px]" dir="ltr">{tx.userEmail}</td>
                        <td className="px-6 py-2.5 text-slate-400 font-mono text-xs" dir="ltr">{tx.modelId ?? "—"}</td>
                        <td className={`px-6 py-2.5 font-mono ${tx.amount >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                          {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-2.5 text-slate-500 text-xs">{formatRelativeDate(tx.createdAt, locale)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
