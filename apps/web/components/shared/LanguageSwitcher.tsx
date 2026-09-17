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
    <div className="flex items-center gap-0.5 bg-white/[0.05] backdrop-blur-md rounded-lg p-1 border border-white/10">
      {(["ar", "en"] as const).map(l => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all active:scale-95
            ${locale === l ? "bg-[color:var(--accent-blue)] text-white" : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]"}`}
        >
          {l === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );
}
