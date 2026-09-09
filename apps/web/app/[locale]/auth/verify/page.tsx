import { useTranslations } from "next-intl";
import Link from "next/link";

interface Props { searchParams: Promise<{ email?: string }> }

export default async function VerifyPage({ searchParams }: Props) {
  const { email } = await searchParams;

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl mb-6">📧</div>
        <h1 className="text-2xl font-bold text-white mb-4">تأكيد البريد الإلكتروني</h1>
        <p className="text-slate-400 mb-2">أرسلنا رابط تأكيد إلى:</p>
        {email && <p className="text-blue-400 font-medium mb-6" dir="ltr">{email}</p>}
        <p className="text-slate-400 text-sm mb-8">تحقق من بريدك الإلكتروني وانقر على الرابط للتفعيل.</p>
        <Link href="/ar/auth/login"
          className="text-blue-400 hover:text-blue-300 text-sm underline transition-colors">
          العودة لتسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
