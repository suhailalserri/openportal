"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";

export default function AdminCodesPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [form, setForm] = useState({ count: "10", value: "50", label: "", expires: "" });
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/codes/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count:       parseInt(form.count),
          creditValue: parseInt(form.value),
          label:       form.label || `batch-${Date.now()}`,
          expiresAt:   form.expires || null,
        }),
      });
      const data = await res.json() as { codes: string[] };
      setGenerated(data.codes);
      toast.success(`${data.codes.length} ${locale === "ar" ? "كود تم إنشاؤه" : "codes generated"}`);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    const csv = ["Code,Value,Expires", ...generated.map(c => `${c},${form.value},${form.expires || "never"}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a   = document.createElement("a"); a.href = url; a.download = `${form.label || "codes"}.csv`; a.click();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">{t("admin.codes")}</h1>

      <Card>
        <CardHeader><h2 className="font-semibold text-white">{t("admin.generateCodes")}</h2></CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("admin.codeCount")}</label>
              <input type="number" min="1" max="1000" value={form.count}
                onChange={e => setForm(f => ({...f, count: e.target.value}))}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("admin.creditValue")}</label>
              <input type="number" min="1" value={form.value}
                onChange={e => setForm(f => ({...f, value: e.target.value}))}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("admin.batchLabel")}</label>
              <input type="text" placeholder="e.g. Ramadan2026" value={form.label}
                onChange={e => setForm(f => ({...f, label: e.target.value}))}
                dir="ltr"
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("admin.expiryDate")}</label>
              <input type="date" value={form.expires}
                onChange={e => setForm(f => ({...f, expires: e.target.value}))}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-blue-500" />
            </div>
            <div className="col-span-2 flex gap-3">
              <Button type="submit" loading={loading}>{t("admin.generateCodes")}</Button>
              {generated.length > 0 && (
                <Button type="button" variant="secondary" onClick={downloadCSV}>
                  {t("admin.downloadCsv")}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {generated.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">
                {generated.length} {locale === "ar" ? "كود تم إنشاؤه" : "codes generated"}
              </h2>
              <Badge variant="success">جديد</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {generated.map(code => (
                <div key={code} className="bg-[#0F172A] rounded-lg px-3 py-2 font-mono text-sm
                                           text-green-400 border border-slate-700 text-center tracking-wider"
                  dir="ltr">
                  {code}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
