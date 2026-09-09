import { redirect } from "next/navigation";

interface Props { children: React.ReactNode; params: Promise<{ locale: string }> }

// TODO: Add real auth check using Better Auth session
async function checkAdminAuth(): Promise<boolean> {
  // Replace with actual session check
  return true;
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
