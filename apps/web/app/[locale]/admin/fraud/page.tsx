"use client";
import { useState, useEffect } from "react";
import { useParams }           from "next/navigation";
import { toast }               from "sonner";
import { Card }                from "@/components/ui/card";
import { Badge }               from "@/components/ui/badge";
import { Button }              from "@/components/ui/button";
import { Skeleton }            from "@/components/ui/skeleton";
import { formatDate }          from "@/lib/utils";

interface FraudEvent {
  id: string; userId: string | null; type: string; severity: string;
  details: Record<string, unknown> | null; ip: string | null;
  resolved: boolean; createdAt: string;
}

const SEVERITY_VARIANT: Record<string, "error" | "warning" | "default" | "blue"> = {
  critical: "error", high: "error", medium: "warning", low: "default",
};

const TYPE_LABELS: Record<string, string> = {
  HIGH_REQUEST_VELOCITY:    "معدل طلبات مرتفع",
  MULTIPLE_IPS:             "عناوين IP متعددة",
  SHARED_IP_MULTI_ACCOUNT:  "حسابات متعددة / نفس IP",
  REDEEM_BRUTE_FORCE:       "اختراق الأكواد",
  REDEEM_DAILY_LIMIT:       "تجاوز الحد اليومي",
  HIGH_SPEND_VELOCITY:      "إنفاق مشبوه",
  SUSPICIOUS_PATTERN:       "نمط مشبوه",
};

export default function AdminFraudPage() {
  const { locale }    = useParams<{ locale: string }>();
  const [events,  setEvents]  = useState<FraudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => { loadEvents(); }, [showResolved]);

  async function loadEvents() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/fraud?resolved=${showResolved}`);
      const data = await res.json() as { items: FraudEvent[] };
      setEvents(data.items ?? []);
    } finally { setLoading(false); }
  }

  async function resolveEvent(id: string) {
    await fetch(`/api/admin/fraud/${id}/resolve`, { method: "POST" });
    toast.success("تم تحديد الحدث كمحلول");
    loadEvents();
  }

  async function suspendUser(userId: string) {
    await fetch(`/api/admin/users/${userId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: "suspended" }),
    });
    toast.success("تم تعليق الحساب");
    loadEvents();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">مكافحة الاحتيال 🛡️</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showResolved}
              onChange={e => setShowResolved(e.target.checked)}
              className="rounded" />
            إظهار المحلولة
          </label>
          <button onClick={loadEvents} className="text-sm text-blue-400 hover:underline">تحديث</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "أحداث غير محلولة", value: events.filter(e => !e.resolved).length, color: "text-red-400" },
          { label: "حرجة", value: events.filter(e => e.severity === "critical").length, color: "text-red-400" },
          { label: "عالية", value: events.filter(e => e.severity === "high").length, color: "text-orange-400" },
          { label: "متوسطة", value: events.filter(e => e.severity === "medium").length, color: "text-amber-400" },
        ].map(stat => (
          <Card key={stat.label}>
            <div className="p-4 text-center">
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="divide-y divide-slate-800">
          {loading
            ? [1,2,3].map(i => <div key={i} className="p-6"><Skeleton className="h-16 w-full" /></div>)
            : events.length === 0
              ? <p className="text-center text-slate-500 py-12">لا توجد أحداث {showResolved ? "محلولة" : "غير محلولة"}</p>
              : events.map(ev => (
                <div key={ev.id} className="p-4 hover:bg-slate-800/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={SEVERITY_VARIANT[ev.severity] ?? "default"}>
                          {ev.severity}
                        </Badge>
                        <span className="text-sm font-medium text-white">
                          {TYPE_LABELS[ev.type] ?? ev.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                        {ev.userId && (
                          <span className="font-mono">User: {ev.userId.slice(0,8)}…</span>
                        )}
                        {ev.ip && <span dir="ltr">IP: {ev.ip}</span>}
                        <span>{formatDate(ev.createdAt, locale)}</span>
                      </div>
                      {ev.details && Object.keys(ev.details).length > 0 && (
                        <div className="mt-2 text-xs text-slate-500 font-mono bg-slate-900/50
                                        rounded-lg px-3 py-2 border border-slate-700 max-w-md" dir="ltr">
                          {JSON.stringify(ev.details, null, 2)}
                        </div>
                      )}
                    </div>

                    {!ev.resolved && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {ev.userId && (
                          <button onClick={() => suspendUser(ev.userId!)}
                            className="text-xs text-red-400 hover:underline px-2 py-1">
                            تعليق المستخدم
                          </button>
                        )}
                        <button onClick={() => resolveEvent(ev.id)}
                          className="text-xs text-emerald-400 hover:underline px-2 py-1">
                          تحديد كمحلول ✓
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
          }
        </div>
      </Card>
    </div>
  );
}
