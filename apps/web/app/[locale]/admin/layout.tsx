import { redirect } from "next/navigation";
import { auth }     from "@/lib/auth";
import { headers }  from "next/headers";

interface Props { children: React.ReactNode; params: Promise<{ locale: string }> }

// Mirrors the role check every /api/admin/* route already enforces
// server-side — this was previously a hardcoded `return true`, so the
// admin UI shell rendered for anyone who loaded the URL. The underlying
// data endpoints were never actually exposed (they check the session
// themselves), but there's no reason to let unauthenticated visitors see
// the admin nav/pages at all, and a stub like that is one careless edit
// away from becoming a real hole.
async function checkAdminAuth(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return false;
  const role = (session.user as { role?: string }).role;
  return role === "admin" || role === "superadmin";
}

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  const isAdmin    = await checkAdminAuth();
  if (!isAdmin) redirect(`/${locale}/auth/login`);

  return (
    <div className="flex h-screen bg-[#0F172A]">
      {/* Admin sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#1E293B] border-e border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Admin Panel</p>
          <p className="text-lg font-bold text-white mt-1">
            {locale === "ar" ? "لوحة الإدارة" : "Dashboard"}
          </p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { href: "dashboard", icon: "📊", labelAr: "لوحة التحكم",  labelEn: "Dashboard"  },
            { href: "users",     icon: "👥", labelAr: "المستخدمون",   labelEn: "Users"      },
            { href: "codes",     icon: "🎟️", labelAr: "أكواد الشحن",  labelEn: "Codes"      },
            { href: "channels",  icon: "⚡", labelAr: "القنوات",      labelEn: "Channels"   },
            { href: "models",    icon: "🤖", labelAr: "النماذج",      labelEn: "Models"     },
            { href: "logs",      icon: "📋", labelAr: "السجلات",      labelEn: "Logs"       },
            { href: "fraud",     icon: "🛡️", labelAr: "الاحتيال",    labelEn: "Fraud"      },
            { href: "settings",  icon: "⚙️", labelAr: "الإعدادات",   labelEn: "Settings"   },
          ].map(item => (
            <a key={item.href}
              href={`/${locale}/admin/${item.href}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400
                         hover:text-white hover:bg-slate-700 transition-colors">
              <span>{item.icon}</span>
              <span>{locale === "ar" ? item.labelAr : item.labelEn}</span>
            </a>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <a href={`/${locale}/chat`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white">
            ← {locale === "ar" ? "العودة للتطبيق" : "Back to App"}
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
