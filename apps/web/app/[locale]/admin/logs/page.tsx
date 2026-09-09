"use client";
import { useState, useEffect, useRef } from "react";
import { useParams }  from "next/navigation";
import { Card }       from "@/components/ui/card";
import { Badge }      from "@/components/ui/badge";
import { Skeleton }   from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

interface LogEntry {
  id: string; userId: string; modelId: string;
  inputTokens: number; outputTokens: number;
  creditCost: number; createdAt: string; type: string;
}

export default function AdminLogsPage() {
  const { locale }    = useParams<{ locale: string }>();
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ model: "", type: "" });

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/logs");
      const data = await res.json() as { items: LogEntry[] };
      setLogs(data.items ?? []);
    } finally { setLoading(false); }
  }

  const filtered = logs.filter(l =>
    (!filter.model || l.modelId?.includes(filter.model)) &&
    (!filter.type  || l.type === filter.type)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">سجلات الاستخدام</h1>
        <button onClick={loadLogs}
          className="text-sm text-blue-400 hover:underline">تحديث</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input value={filter.model} onChange={e => setFilter(f => ({...f, model: e.target.value}))}
          placeholder="فلتر النموذج..." dir="ltr"
          className="bg-[#1E293B] border border-slate-600 rounded-xl px-3 py-2 text-white text-sm
                     focus:outline-none focus:border-blue-500 w-48" />
        <select value={filter.type} onChange={e => setFilter(f => ({...f, type: e.target.value}))}
          className="bg-[#1E293B] border border-slate-600 rounded-xl px-3 py-2 text-white text-sm
                     focus:outline-none focus:border-blue-500">
          <option value="">كل الأنواع</option>
          <option value="usage_debit">استخدام</option>
          <option value="redeem">استبدال</option>
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-start px-6 py-3 font-medium">المستخدم</th>
                <th className="text-start px-4 py-3 font-medium">النموذج</th>
                <th className="text-start px-4 py-3 font-medium">الرموز</th>
                <th className="text-start px-4 py-3 font-medium">التكلفة</th>
                <th className="text-start px-4 py-3 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1,2,3,4,5].map(i => (
                  <tr key={i} className="border-b border-slate-800">
                    {[1,2,3,4,5].map(j => <td key={j} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))
                : filtered.length === 0
                  ? <tr><td colSpan={5} className="text-center py-12 text-slate-500">لا توجد سجلات</td></tr>
                  : filtered.map(log => (
                    <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-6 py-3 text-slate-300 text-xs font-mono">{log.userId?.slice(0,8)}…</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{log.modelId ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {log.inputTokens ?? 0}↑ {log.outputTokens ?? 0}↓
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-red-400">
                        -{((log.creditCost ?? 0) / 1_000_000).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatDate(log.createdAt, locale)}
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
