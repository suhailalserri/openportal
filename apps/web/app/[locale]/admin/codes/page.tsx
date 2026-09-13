"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Select }   from "@/components/ui/select";
import { Input }    from "@/components/ui/input";
import { formatCredits, formatDate } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export default function AdminCodesPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const isAr = locale === "ar";
  const utils = trpc.useUtils();

  const { data: packages = []  } = trpc.admin.listPackages.useQuery();
  const { data: methods  = []  } = trpc.admin.listPaymentMethods.useQuery();
  const { data: batches  = [], isLoading: batchesLoading } = trpc.admin.listCodeBatches.useQuery();
  const { data: inventory = [] } = trpc.admin.codeInventory.useQuery({ lowStockThreshold: 20 });

  const [form, setForm] = useState({
    packageId: "", paymentMethodId: "", count: "10", value: "50", label: "", expires: "",
  });
  const [generated, setGenerated] = useState<string[]>([]);

  const generateMutation = trpc.admin.generateCodes.useMutation({
    onSuccess: (data) => {
      setGenerated(data.codes);
      toast.success(`${data.count} ${isAr ? "كود تم إنشاؤه" : "codes generated"}`);
      utils.admin.listCodeBatches.invalidate();
      utils.admin.codeInventory.invalidate();
    },
    onError: (err) => toast.error(err.message || t("errors.generic")),
  });

  const revokeBatchMutation = trpc.admin.revokeCodeBatch.useMutation({
    onSuccess: (data) => {
      toast.success(isAr ? `تم إلغاء ${data.revokedCount} كود` : `Revoked ${data.revokedCount} codes`);
      utils.admin.listCodeBatches.invalidate();
      utils.admin.codeInventory.invalidate();
    },
    onError: (err) => toast.error(err.message || t("errors.generic")),
  });

  const selectedPackage = packages.find(p => p.id === form.packageId);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    generateMutation.mutate({
      count:           parseInt(form.count, 10),
      creditValue:     selectedPackage ? selectedPackage.credits / 1_000_000 : parseInt(form.value, 10),
      label:           form.label || `batch-${Date.now()}`,
      expiresAt:       form.expires ? new Date(form.expires).toISOString() : undefined,
      packageId:       form.packageId || undefined,
      paymentMethodId: form.paymentMethodId || undefined,
    });
  }

  function downloadCSV(codes: { code: string; faceValue: string | null; expiresAt: string | Date | null }[], filename: string) {
    const csv = ["Code,Value,Expires", ...codes.map(c =>
      `${c.code},${c.faceValue ?? ""},${c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : "never"}`
    )].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // "Printable PDF cards" (§7.7) — a real PDF library isn't in this app's
  // dependencies yet, so this opens a print-formatted view and lets the
  // browser's own "Save as PDF" destination produce the file. Swap for a
  // real PDF export (e.g. the pdf skill's approach, server-side) if a
  // literal .pdf download becomes a hard requirement later.
  function printCards(codes: { code: string; faceValue: string | null }[], label: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html dir="ltr"><head><title>${label}</title>
      <style>
        body { font-family: monospace; margin: 20px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .card { border: 1px dashed #999; border-radius: 8px; padding: 14px; text-align: center; }
        .code { font-size: 15px; font-weight: bold; letter-spacing: 1px; }
        .value { font-size: 12px; color: #555; margin-top: 4px; }
        @media print { .card { break-inside: avoid; } }
      </style></head><body>
      <div class="grid">
        ${codes.map(c => `<div class="card"><div class="code">${c.code}</div><div class="value">${c.faceValue ?? ""}</div></div>`).join("")}
      </div>
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">{t("admin.codes")}</h1>

      {/* Tracking dashboard — §7.6 */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">{isAr ? "تتبع المخزون" : "Inventory tracking"}</h2></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-start px-6 py-3 font-medium">{isAr ? "طريقة الدفع" : "Payment method"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "الباقة" : "Package"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "تم إنشاؤها" : "Generated"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "تم استبدالها" : "Redeemed"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "متبقٍ" : "Remaining"}</th>
                <th className="text-start px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-500 py-8 text-sm">
                  {isAr ? "لا يوجد مخزون مرتبط بطريقة دفع بعد" : "No tagged inventory yet"}
                </td></tr>
              )}
              {inventory.map((row) => {
                const method = methods.find(m => m.id === row.paymentMethodId);
                const pkg    = packages.find(p => p.id === row.packageId);
                return (
                  <tr key={`${row.paymentMethodId}-${row.packageId}`} className="border-b border-slate-800">
                    <td className="px-6 py-3 text-white">{isAr ? method?.nameAr : method?.name}</td>
                    <td className="px-4 py-3 text-slate-300">{isAr ? pkg?.nameAr : pkg?.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{row.generated}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{row.redeemed}</td>
                    <td className="px-4 py-3 font-mono text-white">{row.remaining}</td>
                    <td className="px-4 py-3">
                      {row.lowStock && <Badge variant="warning">{isAr ? "مخزون منخفض" : "Low stock"}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Generate — §7.5 */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">{t("admin.generateCodes")}</h2></CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="grid grid-cols-2 gap-4">
            <Select
              label={isAr ? "طريقة الدفع (اختياري)" : "Payment method (optional)"}
              value={form.paymentMethodId}
              onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))}
            >
              <option value="">{isAr ? "— دفعة مخصصة —" : "— ad-hoc batch —"}</option>
              {methods.map(m => <option key={m.id} value={m.id}>{isAr ? m.nameAr : m.name}</option>)}
            </Select>
            <Select
              label={isAr ? "الباقة (اختياري)" : "Package (optional)"}
              value={form.packageId}
              onChange={e => setForm(f => ({ ...f, packageId: e.target.value }))}
            >
              <option value="">{isAr ? "— قيمة مخصصة —" : "— custom value —"}</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>
                  {isAr ? p.nameAr : p.name} ({formatCredits(p.credits, locale)} {t("balance.unit")})
                </option>
              ))}
            </Select>

            <Input
              type="number" min={1} max={1000}
              label={t("admin.codeCount")}
              value={form.count}
              onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
            />
            <Input
              type="number" min={1}
              label={t("admin.creditValue")}
              value={form.value}
              disabled={!!selectedPackage}
              hint={selectedPackage ? (isAr ? "مشتقة من الباقة المختارة" : "Derived from selected package") : undefined}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            />
            <Input
              type="text" dir="ltr" placeholder="e.g. Ramadan2026"
              label={t("admin.batchLabel")}
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
            <Input
              type="date"
              label={t("admin.expiryDate")}
              value={form.expires}
              onChange={e => setForm(f => ({ ...f, expires: e.target.value }))}
            />
            <div className="col-span-2 flex gap-3">
              <Button type="submit" loading={generateMutation.isPending}>{t("admin.generateCodes")}</Button>
              {generated.length > 0 && (
                <Button type="button" variant="secondary"
                  onClick={() => downloadCSV(generated.map(code => ({ code, faceValue: form.label, expiresAt: form.expires || null })), `${form.label || "codes"}.csv`)}>
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
                {generated.length} {isAr ? "كود تم إنشاؤه" : "codes generated"}
              </h2>
              <Badge variant="success">{isAr ? "جديد" : "new"}</Badge>
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

      {/* Batches — with per-batch CSV / print export, §7.7 */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">{isAr ? "الدفعات" : "Batches"}</h2></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-start px-6 py-3 font-medium">{isAr ? "التسمية" : "Label"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "الإجمالي" : "Total"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "مستخدم" : "Used"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "التاريخ" : "Date"}</th>
                <th className="text-start px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {batchesLoading && (
                <tr><td colSpan={5} className="text-center text-slate-500 py-8 text-sm">…</td></tr>
              )}
              {batches.map((b) => (
                <tr key={b.batchId} className="border-b border-slate-800">
                  <td className="px-6 py-3 text-white font-mono">{b.batchLabel}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{b.total}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{b.used}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(b.createdAt, locale)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary"
                        onClick={async () => {
                          const rows = await utils.admin.getBatchCodes.fetch({ batchId: b.batchId });
                          downloadCSV(rows, `${b.batchLabel || b.batchId}.csv`);
                        }}>
                        CSV
                      </Button>
                      <Button size="sm" variant="secondary"
                        onClick={async () => {
                          const rows = await utils.admin.getBatchCodes.fetch({ batchId: b.batchId });
                          printCards(rows, b.batchLabel ?? b.batchId);
                        }}>
                        {isAr ? "طباعة" : "Print"}
                      </Button>
                      <Button size="sm" variant="danger"
                        loading={revokeBatchMutation.isPending}
                        onClick={() => {
                          if (confirm(isAr ? "إلغاء جميع الأكواد غير المستخدمة في هذه الدفعة؟" : "Revoke all unused codes in this batch?")) {
                            revokeBatchMutation.mutate({ batchId: b.batchId });
                          }
                        }}>
                        {isAr ? "إلغاء" : "Revoke"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
