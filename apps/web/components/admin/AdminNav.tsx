"use client";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Ticket, Package, CreditCard, Receipt,
  Zap, Bot, ScrollText, ShieldAlert, Settings, ArrowLeft,
} from "lucide-react";

interface Props { locale: string }

const NAV_ITEMS = [
  { href: "dashboard",        Icon: LayoutDashboard, labelAr: "لوحة التحكم",   labelEn: "Dashboard"       },
  { href: "users",            Icon: Users,           labelAr: "المستخدمون",    labelEn: "Users"           },
  { href: "codes",            Icon: Ticket,          labelAr: "أكواد الشحن",   labelEn: "Codes"           },
  { href: "packages",         Icon: Package,         labelAr: "الباقات",       labelEn: "Packages"        },
  { href: "payment-methods",  Icon: CreditCard,      labelAr: "طرق الدفع",     labelEn: "Payment Methods" },
  { href: "manual-payments",  Icon: Receipt,         labelAr: "طلبات التحويل", labelEn: "Manual Payments" },
  { href: "channels",         Icon: Zap,             labelAr: "القنوات",       labelEn: "Channels"        },
  { href: "models",           Icon: Bot,             labelAr: "النماذج",       labelEn: "Models"          },
  { href: "logs",             Icon: ScrollText,      labelAr: "السجلات",       labelEn: "Logs"            },
  { href: "fraud",            Icon: ShieldAlert,     labelAr: "الاحتيال",      labelEn: "Fraud"           },
  { href: "settings",         Icon: Settings,        labelAr: "الإعدادات",     labelEn: "Settings"        },
] as const;

export function AdminNav({ locale }: Props) {
  const pathname = usePathname();
  const isRTL    = locale === "ar";

  return (
    <>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, Icon, labelAr, labelEn }) => {
          const isActive = pathname.includes(`/admin/${href}`);
          return (
            <a key={href}
              href={`/${locale}/admin/${href}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors
                ${isActive
                  ? "bg-[color:var(--accent-blue)]/12 border border-[color:var(--accent-blue)]/30 text-slate-50"
                  : "text-slate-400 border border-transparent hover:text-slate-100 hover:bg-slate-800"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{locale === "ar" ? labelAr : labelEn}</span>
            </a>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-700">
        <a href={`/${locale}/chat`}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-100 transition-colors">
          <ArrowLeft className="h-4 w-4" style={{ transform: isRTL ? "scaleX(-1)" : "none" }} />
          {locale === "ar" ? "العودة للتطبيق" : "Back to App"}
        </a>
      </div>
    </>
  );
}
