"use client";
import { useState }    from "react";
import { useParams }   from "next/navigation";
import { toast }       from "sonner";
import { Card }        from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { Button }      from "@/components/ui/button";
import { MODEL_CATALOG, WHOLESALE_COSTS } from "@ai-platform/config";

export default function AdminModelsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [models, setModels] = useState(MODEL_CATALOG.map(m => ({ ...m })));

  function toggleModel(id: string) {
    setModels(prev => prev.map(m => m.id === id ? { ...m, isAvailable: !m.isAvailable } : m));
    toast.success("تم تحديث حالة النموذج");
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">النماذج</h1>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-start px-4 py-3 font-medium">النموذج</th>
              <th className="text-start px-4 py-3 font-medium">المزود</th>
              <th className="text-start px-4 py-3 font-medium">المضاعف</th>
              <th className="text-start px-4 py-3 font-medium">الهامش</th>
              <th className="text-start px-4 py-3 font-medium">سياق</th>
              <th className="text-start px-4 py-3 font-medium">الحالة</th>
              <th className="text-start px-4 py-3 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {models.map(m => {
              const margin = (((m.markupMultiplier - 1) / m.markupMultiplier) * 100).toFixed(0);
              const w = WHOLESALE_COSTS[m.id];
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
                  <td className="px-4 py-3 text-slate-300 font-mono">{m.markupMultiplier}x</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${parseInt(margin) >= 50 ? "text-emerald-400" : parseInt(margin) >= 40 ? "text-amber-400" : "text-red-400"}`}>
                      {margin}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                    {(m.contextWindow / 1000).toFixed(0)}k
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={m.isAvailable ? "success" : "error"}>
                      {m.isAvailable ? "متاح" : "معطل"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleModel(m.id)}
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
    </div>
  );
}
