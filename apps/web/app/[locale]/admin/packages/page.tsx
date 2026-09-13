"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCredits } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const emptyForm = {
  id: "", name: "", nameAr: "", priceYer: "", priceUsdEquivalent: "",
  credits: "", description: "", descriptionAr: "", sortOrder: "0",
};

export default function AdminPackagesPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const isAr = locale === "ar";
  const utils = trpc.useUtils();

  const { data: packages = [], isLoading } = trpc.admin.listPackages.useQuery();
  const [form, setForm]   = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  const createMutation = trpc.admin.createPackage.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم إنشاء الباقة" : "Package created");
      utils.admin.listPackages.invalidate();
      setForm(emptyForm);
      setEditing(false);
    },
    onError: (e) => toast.error(e.message || t("errors.generic")),
  });

  const updateMutation = trpc.admin.updatePackage.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث الباقة" : "Package updated");
      utils.admin.listPackages.invalidate();
      setForm(emptyForm);
      setEditing(false);
    },
    onError: (e) => toast.error(e.message || t("errors.generic")),
  });

  function startEdit(pkg: typeof packages[number]) {
    setForm({
      id: pkg.id, name: pkg.name, nameAr: pkg.nameAr,
      priceYer: String(pkg.priceYer), priceUsdEquivalent: pkg.priceUsdEquivalent,
      credits: String(pkg.credits / 1_000_000),
      description: pkg.description ?? "", descriptionAr: pkg.descriptionAr ?? "",
      sortOrder: String(pkg.sortOrder),
    });
    setEditing(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name, nameAr: form.nameAr,
      priceYer: parseInt(form.priceYer, 10),
      priceUsdEquivalent: parseFloat(form.priceUsdEquivalent),
      credits: parseInt(form.credits, 10),
      description: form.description || undefined,
      descriptionAr: form.descriptionAr || undefined,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    };
    if (form.id) {
      updateMutation.mutate({ id: form.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleActive(pkg: typeof packages[number]) {
    updateMutation.mutate({ id: pkg.id, isActive: !pkg.isActive });
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">{isAr ? "الباقات" : "Packages"}</h1>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-white">
            {form.id ? (isAr ? "تعديل الباقة" : "Edit package") : (isAr ? "باقة جديدة" : "New package")}
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <Input label={isAr ? "الاسم (إنجليزي)" : "Name (English)"} dir="ltr" required
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input label={isAr ? "الاسم (عربي)" : "Name (Arabic)"} required
              value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
            <Input type="number" min={1} label={isAr ? "السعر (ريال يمني)" : "Price (YER)"} required
              value={form.priceYer} onChange={e => setForm(f => ({ ...f, priceYer: e.target.value }))} />
            <Input type="number" step="0.01" min={0} label={isAr ? "ما يعادله بالدولار (داخلي)" : "USD equivalent (internal)"} required
              value={form.priceUsdEquivalent} onChange={e => setForm(f => ({ ...f, priceUsdEquivalent: e.target.value }))} />
            <Input type="number" min={1} label={t("balance.unit")} required
              hint={isAr ? "بوحدة الرصيد المعروضة، وليس micro-credits" : "In display credits, not micro-credits"}
              value={form.credits} onChange={e => setForm(f => ({ ...f, credits: e.target.value }))} />
            <Input type="number" label={isAr ? "ترتيب العرض" : "Sort order"}
              value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
            <Textarea label={isAr ? "الوصف (إنجليزي)" : "Description (English)"} dir="ltr" rows={2}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Textarea label={isAr ? "الوصف (عربي)" : "Description (Arabic)"} rows={2}
              value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} />

            <div className="col-span-2 flex gap-3">
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {form.id ? (isAr ? "حفظ التغييرات" : "Save changes") : (isAr ? "إنشاء" : "Create")}
              </Button>
              {editing && (
                <Button type="button" variant="secondary" onClick={() => { setForm(emptyForm); setEditing(false); }}>
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-white">{isAr ? "كل الباقات" : "All packages"}</h2></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-start px-6 py-3 font-medium">{isAr ? "الاسم" : "Name"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "السعر" : "Price"}</th>
                <th className="text-start px-4 py-3 font-medium">{t("balance.unit")}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "الحالة" : "Status"}</th>
                <th className="text-start px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="text-center text-slate-500 py-8 text-sm">…</td></tr>}
              {packages.map((pkg) => (
                <tr key={pkg.id} className="border-b border-slate-800">
                  <td className="px-6 py-3 text-white">{isAr ? pkg.nameAr : pkg.name}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{pkg.priceYer.toLocaleString()} YER</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{formatCredits(pkg.credits, locale)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={pkg.isActive ? "success" : "default"}>
                      {pkg.isActive ? (isAr ? "نشطة" : "active") : (isAr ? "معطلة" : "inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(pkg)}>
                        {isAr ? "تعديل" : "Edit"}
                      </Button>
                      <Button size="sm" variant={pkg.isActive ? "danger" : "secondary"} onClick={() => toggleActive(pkg)}>
                        {pkg.isActive ? (isAr ? "تعطيل" : "Deactivate") : (isAr ? "تفعيل" : "Activate")}
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
