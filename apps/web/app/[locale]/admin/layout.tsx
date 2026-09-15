import { redirect } from "next/navigation";
import { auth }     from "@/lib/auth";
import { headers }  from "next/headers";
import { AdminNav }  from "@/components/admin/AdminNav";

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
      <aside className="w-56 flex-shrink-0 bg-[#1E293B] border-e border-slate-700 flex flex-col
                        shadow-[var(--shadow-elevation-2)]">
        <div className="p-4 border-b border-slate-700">
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Admin Panel</p>
          <p className="text-lg font-bold text-white mt-1">
            {locale === "ar" ? "لوحة الإدارة" : "Dashboard"}
          </p>
        </div>
        <AdminNav locale={locale} />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
