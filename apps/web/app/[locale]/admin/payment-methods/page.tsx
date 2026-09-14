"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Input }    from "@/components/ui/input";
import { Select }   from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const emptyForm = {
  id: "", name: "", nameAr: "", type: "manual_transfer" as "jaib_voucher" | "manual_transfer",
  accountCode: "", instructions: "", instructionsAr: "", sortOrder: "0",
};

export default function AdminPaymentMethodsPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const isAr = locale === "ar";
  const utils = trpc.useUtils();

  const { data: methods = [], isLoading } = trpc.admin.listPaymentMethods.useQuery();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  const createMutation = trpc.admin.createPaymentMethod.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم إنشاء طريقة الدفع" : "Payment method created");
      utils.admin.listPaymentMethods.invalidate();
      setForm(emptyForm);
      setEditing(false);
    },
    onError: (e) => toast.error(e.message || t("errors.generic")),
  });

  const updateMutation = trpc.admin.updatePaymentMethod.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم التحديث" : "Updated");
      utils.admin.listPaymentMethods.invalidate();
      setForm(emptyForm);
      setEditing(false);
    },
    onError: (e) => toast.error(e.message || t("errors.generic")),
  });

  function startEdit(m: typeof methods[number]) {
    setForm({
      id: m.id, name: m.name, nameAr: m.nameAr, type: m.type,
      accountCode: m.accountCode ?? "", instructions: m.instructions ?? "",
      instructionsAr: m.instructionsAr ?? "", sortOrder: String(m.sortOrder),
    });
    setEditing(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.id) {
      updateMutation.mutate({
        id: form.id, name: form.name, nameAr: form.nameAr,
        accountCode: form.accountCode || undefined,
        instructions: form.instructions || undefined,
        instructionsAr: form.instructionsAr || undefined,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
      });
    } else {
      createMutation.mutate({
        name: form.name, nameAr: form.nameAr, type: form.type,
        accountCode: form.accountCode || undefined,
        instructions: form.instructions || undefined,
        instructionsAr: form.instructionsAr || undefined,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
      });
    }
  }

  function toggleActive(m: typeof methods[number]) {
    updateMutation.mutate({ id: m.id, isActive: !m.isActive });
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">{isAr ? "طرق الدفع" : "Payment Methods"}</h1>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-white">
            {form.id ? (isAr ? "تعديل طريقة الدفع" : "Edit payment method") : (isAr ? "طريقة دفع جديدة" : "New payment method")}
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <Input label={isAr ? "الاسم (إنجليزي)" : "Name (English)"} dir="ltr" required
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input label={isAr ? "الاسم (عربي)" : "Name (Arabic)"} required
              value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
            <Select label={isAr ? "النوع" : "Type"} disabled={!!form.id}
              hint={form.id ? (isAr ? "لا يمكن تغيير النوع بعد الإنشاء" : "Type can't change after creation") : undefined}
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof form.type }))}>
              <option value="jaib_voucher">Jaib (voucher)</option>
              <option value="manual_transfer">{isAr ? "تحويل يدوي" : "Manual transfer"}</option>
            </Select>
            <Input label={isAr ? "رقم المحفظة / الكود" : "Wallet number / network code"} dir="ltr"
              hint={isAr ? "معلوماتي فقط — لا يُستخدم برمجياً" : "Informational only — nothing calls it"}
              value={form.accountCode} onChange={e => setForm(f => ({ ...f, accountCode: e.target.value }))} />
            <Textarea label={isAr ? "التعليمات (إنجليزي)" : "Instructions (English)"} dir="ltr" rows={3}
              value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
            <Textarea label={isAr ? "التعليمات (عربي)" : "Instructions (Arabic)"} rows={3}
              value={form.instructionsAr} onChange={e => setForm(f => ({ ...f, instructionsAr: e.target.value }))} />
            <Input type="number" label={isAr ? "ترتيب العرض" : "Sort order"}
              value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />

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
        <CardHeader><h2 className="font-semibold text-white">{isAr ? "كل طرق الدفع" : "All payment methods"}</h2></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-start px-6 py-3 font-medium">{isAr ? "الاسم" : "Name"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "النوع" : "Type"}</th>
                <th className="text-start px-4 py-3 font-medium">{isAr ? "الحالة" : "Status"}</th>
                <th className="text-start px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="text-center text-slate-500 py-8 text-sm">…</td></tr>}
              {methods.map((m) => (
                <tr key={m.id} className="border-b border-slate-800">
                  <td className="px-6 py-3 text-white">{isAr ? m.nameAr : m.name}</td>
                  <td className="px-4 py-3"><Badge variant="blue">{m.type}</Badge></td>
                  <td className="px-4 py-3">
                    <Badge variant={m.isActive ? "success" : "default"}>
                      {m.isActive ? (isAr ? "نشطة" : "active") : (isAr ? "معطلة" : "inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(m)}>
                        {isAr ? "تعديل" : "Edit"}
                      </Button>
                      <Button size="sm" variant={m.isActive ? "danger" : "secondary"} onClick={() => toggleActive(m)}>
                        {m.isActive ? (isAr ? "تعطيل" : "Deactivate") : (isAr ? "تفعيل" : "Activate")}
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
