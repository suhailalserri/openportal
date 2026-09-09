"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { resetPassword } from "@/lib/auth-client";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const t = useTranslations();
  const { locale }      = useParams<{ locale: string }>();
  const searchParams    = useSearchParams();
  const router          = useRouter();
  const token           = searchParams.get("token") ?? "";

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error(t("auth.errors.passwordMismatch")); return; }
    setLoading(true);
    try {
      await resetPassword({ newPassword: password, token });
      setDone(true);
      setTimeout(() => router.push(`/${locale}/auth/login`), 2000);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">{t("auth.resetPassword")}</h2>

          {done ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-slate-300">{locale === "ar" ? "تم تغيير كلمة المرور بنجاح!" : "Password changed successfully!"}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t("auth.newPassword")}</label>
                <input type="password" required dir="ltr" value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                             text-white focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t("auth.confirmPassword")}</label>
                <input type="password" required dir="ltr" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-white
                              focus:outline-none text-sm transition-colors
                              ${confirm && confirm !== password ? "border-red-500" : "border-slate-600 focus:border-blue-500"}`}
                  placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                           font-semibold py-3 rounded-xl transition-colors text-sm">
                {loading ? t("common.loading") : t("common.save")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
