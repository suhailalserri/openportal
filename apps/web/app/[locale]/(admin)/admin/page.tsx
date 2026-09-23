import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminOverview } from "@/features/admin/overview";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * apps/web/app/[locale]/(admin)/admin/page.tsx (Phase 8a)
 *
 * Replaces the 2.1 placeholder body. Rule 4 (route files are thin):
 * this file only fetches the page-level translations `SectionPage`
 * itself needs (server component) and renders `AdminOverview` — all
 * client logic (the DataTable + its data hook) lives in `features/admin`.
 */
export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <SectionPage title={tNav("adminOverview")}>
      <AdminOverview />
    </SectionPage>
  );
}
