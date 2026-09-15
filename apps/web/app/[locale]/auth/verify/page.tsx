import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { email } = await searchParams;
  const t = await getTranslations({ locale });

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="p-8 text-center shadow-[var(--shadow-elevation-3)]">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl
                          bg-blue-500/10 border border-blue-500/20 mb-6">
            <Mail className="h-7 w-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">{t("auth.verifyEmail")}</h1>
          {email ? (
            <>
              <p className="text-slate-400 text-sm mb-2">
                {locale === "ar" ? "أرسلنا رابط تأكيد إلى:" : "We sent a verification link to:"}
              </p>
              <p className="text-blue-400 font-medium mb-6" dir="ltr">{email}</p>
            </>
          ) : (
            <p className="text-slate-400 text-sm mb-8">
              {locale === "ar" ? "تحقق من بريدك الإلكتروني وانقر على رابط التأكيد." : "Check your inbox and click the verification link."}
            </p>
          )}
          <Link
            href={`/${locale}/auth/login`}
            className="text-blue-400 hover:text-blue-300 text-sm underline transition-colors"
          >
            {locale === "ar" ? "العودة لتسجيل الدخول" : "Back to login"}
          </Link>
        </Card>
      </div>
    </div>
  );
}
