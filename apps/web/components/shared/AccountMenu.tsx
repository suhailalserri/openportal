"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";

interface Props { locale: string }

export function AccountMenu({ locale }: Props) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (isPending) {
    return <div className="h-9 w-full bg-slate-700/50 animate-pulse rounded-xl" />;
  }

  // Logged out: single clear call-to-action
  if (!session) {
    return (
      <Link
        href={`/${locale}/auth/login`}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-sm
                   font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
      >
        <span>👤</span>
        {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
      </Link>
    );
  }

  const email = session.user?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  async function handleSignOut() {
    await signOut();
    router.push(`/${locale}/auth/login`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-sm
                   text-slate-300 hover:bg-slate-700 transition-colors"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600
                          text-white text-xs font-semibold flex-shrink-0">
          {initial}
        </span>
        <span className="truncate flex-1 text-start">{email}</span>
        <span className="text-slate-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 start-0 w-full bg-[#1E293B] border border-slate-700
                        rounded-xl shadow-2xl overflow-hidden z-50 animate-slide-up">
          <Link
            href={`/${locale}/settings`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            ⚙️ {locale === "ar" ? "الإعدادات" : "Settings"}
          </Link>
          <Link
            href={`/${locale}/billing`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            💳 {locale === "ar" ? "الفواتير" : "Billing"}
          </Link>
          <button
            onClick={handleSignOut}
            className="block w-full text-start px-3 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors
                       border-t border-slate-700"
          >
            🚪 {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
