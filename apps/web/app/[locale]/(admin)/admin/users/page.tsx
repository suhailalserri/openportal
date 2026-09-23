import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminUsersList } from "@/features/admin/users";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * apps/web/app/[locale]/(admin)/admin/users/page.tsx (Phase 8b)
 *
 * Thin route file (Rule 4) — the (admin) layout already guards this
 * segment server-side (2.1). All client logic lives in
 * `features/admin/users`.
 */
export default async function AdminUsersPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.usersPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminUsersList />
    </SectionPage>
  );
}
