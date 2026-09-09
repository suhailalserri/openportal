"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [maintenance, setMaintenance] = useState(false);
  const [welcomeCredits, setWelcomeCredits] = useState("0");

  function handleSave() {
    toast.success("تم حفظ الإعدادات");
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">إعدادات المنصة</h1>

      {/* Branding */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">الهوية البصرية</h2></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">اسم المنصة (عربي)</label>
            <input defaultValue="منصة الذكاء"
              className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5
                         text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">اسم المنصة (English)</label>
            <input defaultValue="AI Platform" dir="ltr"
              className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5
                         text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">رابط الدعم</label>
            <input type="url" dir="ltr" placeholder="https://t.me/yoursupport"
              className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5
                         text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </CardContent>
      </Card>

      {/* New User Bonus */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">مكافأة المستخدم الجديد</h2></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <input type="number" min="0" value={welcomeCredits}
              onChange={e => setWelcomeCredits(e.target.value)}
              className="w-32 bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5
                         text-white text-sm focus:outline-none focus:border-blue-500" />
            <span className="text-slate-400 text-sm">رصيد مجاني عند التسجيل (0 = معطل)</span>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Mode */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">وضع الصيانة</h2></CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={maintenance}
                onChange={e => setMaintenance(e.target.checked)} className="sr-only" />
              <div className={`w-12 h-6 rounded-full transition-colors ${maintenance ? "bg-blue-600" : "bg-slate-700"}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${maintenance ? "start-6" : "start-0.5"}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {maintenance ? "وضع الصيانة مفعّل" : "المنصة تعمل بشكل طبيعي"}
              </p>
              <p className="text-xs text-slate-500">عند التفعيل، يُعرض للمستخدمين رسالة صيانة</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Button onClick={handleSave}>حفظ الإعدادات</Button>
    </div>
  );
}
