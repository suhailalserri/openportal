"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { resetPassword } from "@/lib/auth-client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="min-h-screen bg-noise bg-[color:var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="p-8 shadow-[var(--shadow-elevation-3)]">
          <h2 className="text-xl font-semibold text-slate-50 mb-6">{t("auth.resetPassword")}</h2>

          {done ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl
                              bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <p className="text-slate-300 text-sm">
                {locale === "ar" ? "تم تغيير كلمة المرور بنجاح!" : "Password changed successfully!"}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password" required dir="ltr" value={password}
                onChange={e => setPassword(e.target.value)}
                label={t("auth.newPassword")}
                placeholder="••••••••"
              />
              <Input
                type="password" required dir="ltr" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                label={t("auth.confirmPassword")}
                placeholder="••••••••"
                error={confirm && confirm !== password ? t("auth.errors.passwordMismatch") : undefined}
              />
              <Button type="submit" className="w-full" loading={loading}>
                {t("common.save")}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
