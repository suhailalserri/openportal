"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { toast } from "sonner";

export default function ForgotPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset({ email, redirectTo: `/${locale}/auth/reset` });
      setSent(true);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-8">
          <h2 className="text-xl font-semibold text-white mb-6">{t("auth.resetPassword")}</h2>
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✉️</div>
              <p className="text-slate-300">{t("auth.resetSent")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" required dir="ltr" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" />
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                           font-semibold py-3 rounded-xl transition-colors text-sm">
                {loading ? t("common.loading") : t("common.confirm")}
              </button>
            </form>
          )}
          <div className="mt-4 text-center">
            <Link href={`/${locale}/auth/login`} className="text-blue-400 text-sm hover:underline">
              {t("common.back")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
