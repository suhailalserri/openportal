"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { toast } from "sonner";

export default function LoginPage() {
  const t      = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        toast.error(t("auth.errors.invalidCredentials"));
        return;
      }
      router.push(`/${locale}/chat`);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {locale === "ar" ? "منصة الذكاء" : "AI Platform"}
          </h1>
          <p className="text-slate-400 text-sm">
            {locale === "ar" ? "ذكاء اصطناعي متقدم" : "Advanced AI Models"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {t("auth.login")}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                dir="ltr"
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none focus:border-blue-500
                           transition-colors text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {t("auth.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                dir="ltr"
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none focus:border-blue-500
                           transition-colors text-sm"
                placeholder="••••••••"
              />
            </div>

            <div className="flex justify-end">
              <Link
                href={`/${locale}/auth/forgot`}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm"
            >
              {loading ? t("common.loading") : t("auth.loginButton")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {t("auth.noAccount")}{" "}
            <Link
              href={`/${locale}/auth/register`}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              {t("auth.registerButton")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
