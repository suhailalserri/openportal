"use client";
import Link from "next/link";
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
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const dir = locale === "ar" ? "rtl" : "ltr";

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
        <User className="h-4 w-4" />
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
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-sm
                     text-slate-300 hover:bg-slate-700 transition-colors
                     data-[state=open]:bg-slate-700"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600
                            text-white text-xs font-semibold shrink-0">
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
            {locale === "ar" ? "الإعدادات" : "Settings"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/billing`}>
            <CreditCard className="h-4 w-4 shrink-0" />
            {locale === "ar" ? "الفواتير" : "Billing"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={handleSignOut}>
          <LogOut className="h-4 w-4 shrink-0" />
          {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
