"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { toast } from "sonner";

export default function RegisterPage() {
  const t      = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [form, setForm] = useState({ email: "", password: "", confirm: "", name: "" });
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error(t("auth.errors.passwordMismatch")); return;
    }
    setLoading(true);
    try {
      const result = await signUp.email({
        email:    form.email,
        password: form.password,
        name:     form.name,
      });
      if (result.error) {
        console.error("Sign-up failed:", result.error);
        const msg = result.error.message?.includes("already")
          ? t("auth.errors.emailTaken")
          : t("auth.errors.generic");
        toast.error(msg); return;
      }
      router.push(`/${locale}/auth/verify?email=${encodeURIComponent(form.email)}`);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  const strength = form.password.length === 0 ? null
    : form.password.length < 6 ? "weak"
    : /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) ? "strong"
    : "medium";

  const strengthColors = { weak: "bg-red-500", medium: "bg-yellow-500", strong: "bg-green-500" };
  const strengthLabels = {
    weak:   t("auth.passwordStrength.weak"),
    medium: t("auth.passwordStrength.medium"),
    strong: t("auth.passwordStrength.strong"),
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {locale === "ar" ? "منصة الذكاء" : "AI Platform"}
          </h1>
        </div>

        <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">{t("auth.register")}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {t("auth.displayName")} <span className="text-slate-500">({t("common.optional")})</span>
              </label>
              <input name="name" type="text" value={form.name} onChange={handleChange}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t("auth.email")}</label>
              <input name="email" type="email" required dir="ltr" value={form.email} onChange={handleChange}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="you@example.com" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t("auth.password")}</label>
              <input name="password" type="password" required dir="ltr" value={form.password} onChange={handleChange}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="••••••••" />
              {strength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-slate-700 rounded">
                    <div className={`h-1 rounded transition-all ${strengthColors[strength]}
                      ${strength === "weak" ? "w-1/3" : strength === "medium" ? "w-2/3" : "w-full"}`} />
                  </div>
                  <span className={`text-xs ${strength === "weak" ? "text-red-400" : strength === "medium" ? "text-yellow-400" : "text-green-400"}`}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t("auth.confirmPassword")}</label>
              <input name="confirm" type="password" required dir="ltr" value={form.confirm} onChange={handleChange}
                className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-white
                            placeholder-slate-500 focus:outline-none text-sm transition-colors
                            ${form.confirm && form.confirm !== form.password ? "border-red-500" : "border-slate-600 focus:border-blue-500"}`}
                placeholder="••••••••" />
              {form.confirm && form.confirm !== form.password && (
                <p className="mt-1 text-xs text-red-400">{t("auth.errors.passwordMismatch")}</p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm">
              {loading ? t("common.loading") : t("auth.registerButton")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {t("auth.haveAccount")}{" "}
            <Link href={`/${locale}/auth/login`}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              {t("auth.loginButton")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
