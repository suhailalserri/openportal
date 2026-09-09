import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps { title: string; value: string; sub?: string; icon: string; color?: string }

function StatCard({ title, value, sub, icon, color = "text-blue-400" }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          </div>
          <span className="text-3xl">{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">لوحة التحكم</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="الإيرادات اليوم"    value="0 SAR"   icon="💰" color="text-emerald-400" />
        <StatCard title="تكاليف API"          value="0 SAR"   icon="📡" color="text-blue-400" />
        <StatCard title="هامش الربح"          value="—"       icon="📈" color="text-purple-400" />
        <StatCard title="مستخدمون نشطون"      value="0"       icon="👥" color="text-teal-400" />
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="إجمالي المستخدمين"   value="0"   icon="🧑‍💻" />
        <StatCard title="أكواد مستخدمة اليوم" value="0"   icon="🎟️" />
        <StatCard title="طلبات API اليوم"     value="0"   icon="⚡" />
      </div>

      {/* Channel health placeholder */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="font-semibold text-white mb-4">صحة القنوات</h2>
          <div className="space-y-3">
            {["OpenAI (GPT-4o)", "Anthropic (Claude)", "Google (Gemini)", "DeepSeek"].map(ch => (
              <div key={ch} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <span className="text-sm text-slate-300">{ch}</span>
                <span className="flex items-center gap-2 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  متاح
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
