"use client";
import { useState } from "react";
import { toast }       from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { Button }      from "@/components/ui/button";
import { Input }       from "@/components/ui/input";
import { Skeleton }    from "@/components/ui/skeleton";
import { trpc }        from "@/lib/trpc";

type PendingModel = { id: string; provider: string };

/**
 * Publish form state for one pending model. Defaults are best-effort
 * guesses from the raw gateway id — the admin should still check pricing
 * (free OpenRouter models start at $0/$0, i.e. isAvailable at zero cost).
 */
function publishDefaults(m: PendingModel) {
  const isFree = m.id.endsWith(":free");
  return {
    displayName:             m.id,
    displayNameAr:           m.id,
    badge:                   isFree ? "🆓" : "🤖",
    tier:                    "standard" as const,
    markupMultiplier:        isFree ? 1 : 2,
    contextWindow:           8192,
    maxOutputTokens:         2048,
    supportsVision:          false,
    wholesaleCostInputPerM:  0,
    wholesaleCostOutputPerM: 0,
    rateLimitPerUserDaily:   isFree ? 20 : undefined as number | undefined,
  };
}

function PublishRow({ model, onDone }: { model: PendingModel; onDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm]         = useState(() => publishDefaults(model));
  const publish = trpc.models.publish.useMutation({
    onSuccess: () => { toast.success("تم نشر النموذج"); onDone(); },
    onError:   (e) => toast.error(e.message || "فشل نشر النموذج"),
  });

  return (
    <div className="border-b border-slate-800 last:border-0">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-white truncate" dir="ltr">{model.id}</p>
          <p className="text-xs text-slate-500 capitalize">{model.provider}</p>
        </div>
        <Button size="sm" variant={expanded ? "secondary" : "primary"} onClick={() => setExpanded(e => !e)}>
          {expanded ? "إخفاء" : "مراجعة ونشر"}
        </Button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2">
          <Input label="الاسم المعروض (En)" value={form.displayName}
            onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
          <Input label="الاسم المعروض (عربي)" value={form.displayNameAr}
            onChange={e => setForm(f => ({ ...f, displayNameAr: e.target.value }))} />
          <Input label="الشارة (رمز تعبيري)" value={form.badge}
            onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300">الفئة</label>
            <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as "standard" | "premium" }))}
              className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="standard">standard</option>
              <option value="premium">premium</option>
            </select>
          </div>
          <Input label="مضاعف الهامش" type="number" step="0.1" min="0" value={form.markupMultiplier}
            onChange={e => setForm(f => ({ ...f, markupMultiplier: Number(e.target.value) }))} />
          <Input label="نافذة السياق (توكن)" type="number" min="1" value={form.contextWindow}
            onChange={e => setForm(f => ({ ...f, contextWindow: Number(e.target.value) }))} />
          <Input label="أقصى مخرجات (توكن)" type="number" min="1" value={form.maxOutputTokens}
            onChange={e => setForm(f => ({ ...f, maxOutputTokens: Number(e.target.value) }))} />
          <Input label="تكلفة الإدخال / مليون توكن ($)" type="number" step="0.01" min="0" value={form.wholesaleCostInputPerM}
            onChange={e => setForm(f => ({ ...f, wholesaleCostInputPerM: Number(e.target.value) }))}
            hint="اتركها 0 للنماذج المجانية على OpenRouter" />
          <Input label="تكلفة الإخراج / مليون توكن ($)" type="number" step="0.01" min="0" value={form.wholesaleCostOutputPerM}
            onChange={e => setForm(f => ({ ...f, wholesaleCostOutputPerM: Number(e.target.value) }))} />
          <Input label="حد الرسائل اليومي لكل مستخدم (اختياري)" type="number" min="1"
            value={form.rateLimitPerUserDaily ?? ""}
            onChange={e => setForm(f => ({ ...f, rateLimitPerUserDaily: e.target.value ? Number(e.target.value) : undefined }))} />
          <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
            <input type="checkbox" checked={form.supportsVision}
              onChange={e => setForm(f => ({ ...f, supportsVision: e.target.checked }))} />
            يدعم الصور (Vision)
          </label>

          <div className="sm:col-span-2 flex justify-end">
            <Button loading={publish.isPending} onClick={() => publish.mutate({ modelId: model.id, ...form })}>
              نشر النموذج
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingQueue() {
  const utils   = trpc.useUtils();
  const pending = trpc.models.pending.useQuery();
  const sync    = trpc.models.sync.useMutation({
    onSuccess: (res) => {
      toast.success(`تمت المزامنة: ${res.discovered.length} نموذج جديد، ${res.deactivated.length} تم إخفاؤه`);
      utils.models.pending.invalidate();
      utils.models.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message || "فشلت المزامنة مع البوابة"),
  });

  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row">
        <div>
          <h2 className="font-semibold text-white">قائمة الانتظار — نماذج مكتشَفة من البوابة</h2>
          <p className="text-xs text-slate-500 mt-1">
            لا تظهر هذه النماذج للمستخدمين حتى تُراجع وتُنشر يدوياً.
          </p>
        </div>
        <Button size="sm" loading={sync.isPending} onClick={() => sync.mutate()}>
          🔄 مزامنة الآن من البوابة
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {pending.isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : pending.data && pending.data.length > 0 ? (
          pending.data.map(m => (
            <PublishRow key={m.id} model={m} onDone={() => pending.refetch()} />
          ))
        ) : (
          <p className="text-center text-slate-500 py-8 text-sm">
            لا توجد نماذج بانتظار المراجعة. اضغط «مزامنة الآن» بعد إضافة قناة أو نموذج جديد في البوابة.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminModelsPage() {
  const utils    = trpc.useUtils();
  const allModels = trpc.models.listAll.useQuery();
  const toggle   = trpc.models.toggleAvailability.useMutation({
    onSuccess: () => { toast.success("تم تحديث حالة النموذج"); utils.models.listAll.invalidate(); utils.models.list.invalidate(); },
    onError:   (e) => toast.error(e.message || "فشل التحديث"),
  });

  const published = (allModels.data ?? []).filter(m => m.status === "published");

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">النماذج</h1>

      <PendingQueue />

      <Card>
        <CardHeader><h2 className="font-semibold text-white">النماذج المنشورة</h2></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-start px-4 py-3 font-medium">النموذج</th>
                <th className="text-start px-4 py-3 font-medium">المزود</th>
                <th className="text-start px-4 py-3 font-medium">المضاعف</th>
                <th className="text-start px-4 py-3 font-medium">الهامش</th>
                <th className="text-start px-4 py-3 font-medium">سياق</th>
                <th className="text-start px-4 py-3 font-medium">آخر ظهور بالبوابة</th>
                <th className="text-start px-4 py-3 font-medium">الحالة</th>
                <th className="text-start px-4 py-3 font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {allModels.isLoading ? (
                <tr><td colSpan={8} className="p-6"><Skeleton className="h-24 w-full" /></td></tr>
              ) : published.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-slate-500 py-8">لا توجد نماذج منشورة بعد.</td></tr>
              ) : published.map(m => {
                const markup = Number(m.markupMultiplier);
                const margin = markup > 0 ? (((markup - 1) / markup) * 100).toFixed(0) : "0";
                return (
                  <tr key={m.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{m.badge}</span>
                        <div>
                          <p className="font-medium text-white">{m.displayNameAr}</p>
                          <p className="text-xs text-slate-500" dir="ltr">{m.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 capitalize">{m.provider}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono">{markup}x</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${parseInt(margin) >= 50 ? "text-emerald-400" : parseInt(margin) >= 40 ? "text-amber-400" : "text-red-400"}`}>
                        {margin}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {(m.contextWindow / 1000).toFixed(0)}k
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {m.lastSeenAt ? new Date(m.lastSeenAt).toLocaleString("ar") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.isAvailable ? "success" : "error"}>
                        {m.isAvailable ? "متاح" : "معطل"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle.mutate({ modelId: m.id, isAvailable: !m.isAvailable })}
                        className={`text-xs hover:underline ${m.isAvailable ? "text-red-400" : "text-emerald-400"}`}>
                        {m.isAvailable ? "تعطيل" : "تفعيل"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
