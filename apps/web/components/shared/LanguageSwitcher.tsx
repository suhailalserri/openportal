"use client";
import { useRouter, usePathname, useParams } from "next/navigation";

// Note: kept as a 2-option segmented control, not a dropdown menu.
// Radix DropdownMenu (used in ModelSelector/AccountMenu) is the right
// tool when picking among many items or exposing actions — for a binary
// language toggle it would add an extra click for no benefit, so this
// stays a direct-tap segmented control, just restyled to match the new
// elevation/typography system.
export function LanguageSwitcher() {
  const router   = useRouter();
  const pathname = usePathname();
  const { locale } = useParams<{ locale: string }>();

  function switchLocale(newLocale: string) {
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  }

  return (
    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700
                    shadow-[var(--shadow-elevation-1)]">
      {(["ar", "en"] as const).map(l => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all active:scale-95
            ${locale === l ? "gradient-primary text-white shadow-[var(--shadow-elevation-1)]" : "text-slate-400 hover:text-white"}`}
        >
          {l === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );
}
