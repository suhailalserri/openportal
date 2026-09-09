"use client";
import { useRouter, usePathname, useParams } from "next/navigation";

export function LanguageSwitcher() {
  const router   = useRouter();
  const pathname = usePathname();
  const { locale } = useParams<{ locale: string }>();

  function switchLocale(newLocale: string) {
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  }

  return (
    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
      {(["ar", "en"] as const).map(l => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
            ${locale === l ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
        >
          {l === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );
}
