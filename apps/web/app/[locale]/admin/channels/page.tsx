"use client";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc }     from "@/lib/trpc";

// Real data from New API now — trpc.admin.gatewayChannels calls the
// gateway's own channel-list endpoint (apps/api/src/routers/admin.router.ts).
// This used to be hardcoded mock rows behind a setTimeout that never
// talked to the gateway at all.
export default function AdminChannelsPage() {
  const { data: channels, isLoading, error, refetch, isFetching } = trpc.admin.gatewayChannels.useQuery();

  const providerColors: Record<string, string> = {
    openai:     "text-emerald-400",
    anthropic:  "text-orange-400",
    google:     "text-blue-400",
    deepseek:   "text-purple-400",
    openrouter: "text-pink-400",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">القنوات</h1>
        <button onClick={() => refetch()} disabled={isFetching}
          className="text-xs text-blue-400 hover:underline disabled:opacity-50">
          🔄 {isFetching ? "جارِ التحديث…" : "تحديث"}
        </button>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-red-400 text-sm font-medium mb-1">تعذّر جلب القنوات من البوابة</p>
            <p className="text-slate-400 text-xs" dir="ltr">{error.message}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {isLoading
          ? [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)
          : (channels ?? []).map(ch => (
            <Card key={ch.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${ch.status === 1 ? "bg-emerald-400" : "bg-red-400"} animate-pulse`} />
                    <div>
                      <p className="font-semibold text-white">{ch.name}</p>
                      <p className={`text-sm font-medium ${providerColors[ch.type.toLowerCase()] ?? "text-slate-400"}`}>{ch.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-slate-400 text-xs">الاستجابة</p>
                      <p className={`font-mono font-semibold ${ch.responseTime < 1000 ? "text-emerald-400" : ch.responseTime < 2000 ? "text-amber-400" : "text-red-400"}`}>
                        {ch.responseTime > 0 ? `${ch.responseTime}ms` : "—"}
                      </p>
                    </div>
                    <div className="text-center max-w-[220px]">
                      <p className="text-slate-400 text-xs">النماذج</p>
                      <p className="text-slate-300 text-xs truncate" dir="ltr" title={ch.models.join(", ")}>
                        {ch.models.length > 0 ? `${ch.models.length} model(s)` : "—"}
                      </p>
                    </div>
                    <Badge variant={ch.status === 1 ? "success" : "error"}>
                      {ch.status === 1 ? "متاح" : "معطل"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        }
        {!isLoading && !error && (channels ?? []).length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">لا توجد قنوات على البوابة بعد.</p>
        )}
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-white">إضافة قناة جديدة</h2></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">
            لإضافة قناة جديدة أو نموذج جديد، أضفه من لوحة تحكم New API مباشرةً، ثم اذهب إلى
            صفحة «النماذج» في هذه اللوحة واضغط «مزامنة الآن من البوابة» لاكتشافه ونشره.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
