"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { User, Settings, CreditCard, LogOut, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props { locale: string }

export function AccountMenu({ locale }: Props) {
  const t = useTranslations();
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const dir = locale === "ar" ? "rtl" : "ltr";

  if (isPending) {
    return <div className="h-10 w-full bg-white/[0.05] border border-white/10 animate-pulse rounded-xl" />;
  }

  if (!session) {
    return (
      <Link
        href={`/${locale}/auth/login`}
        className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm
                   font-medium bg-[color:var(--accent-blue)] hover:brightness-110 text-white transition-all
                   shadow-[var(--shadow-elevation-1)]"
      >
        <User className="h-4 w-4" />
        {t("auth.login")}
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
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2.5 w-full px-2 py-2 rounded-xl text-sm
                     text-slate-300 hover:bg-white/[0.06] transition-colors
                     data-[state=open]:bg-white/[0.06]"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[color:var(--accent-blue)]
                            text-white text-xs font-semibold shrink-0 font-display">
            {initial}
          </span>
          <span className="truncate flex-1 text-start">{email}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform duration-200 data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/settings`}>
            <Settings className="h-4 w-4 shrink-0" />
            {t("nav.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/billing`}>
            <CreditCard className="h-4 w-4 shrink-0" />
            {t("nav.billing")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={handleSignOut}>
          <LogOut className="h-4 w-4 shrink-0" />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
