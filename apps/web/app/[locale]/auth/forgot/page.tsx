"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth-client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="min-h-screen bg-noise bg-[color:var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="p-8 shadow-[var(--shadow-elevation-3)]">
          <h2 className="text-xl font-semibold text-slate-50 mb-6">{t("auth.resetPassword")}</h2>
          {sent ? (
            <div className="text-center py-2">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl
                              bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <MailCheck className="h-7 w-7 text-emerald-400" />
              </div>
              <p className="text-slate-300 text-sm">{t("auth.resetSent")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email" required dir="ltr" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                label={t("auth.email")}
              />
              <Button type="submit" className="w-full" loading={loading}>
                {t("common.confirm")}
              </Button>
            </form>
          )}
          <div className="mt-4 text-center">
            <Link href={`/${locale}/auth/login`} className="text-blue-400 text-sm hover:underline">
              {t("common.back")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
