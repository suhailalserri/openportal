import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminUserDetail } from "@/features/admin/users/detail";

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * apps/web/app/[locale]/(admin)/admin/users/[id]/page.tsx (Phase 8b)
 *
 * `id` is validated server-side by `admin.getUserDetail`'s own
 * `z.string().uuid()` input schema (a non-UUID here surfaces as that
 * procedure's BAD_REQUEST via the query's error state, handled by
 * `AdminUserDetail`) — no separate route-level validation needed.
 */
export default async function AdminUserDetailPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.usersPage" });

  return (
    <SectionPage title={t("detail.title")}>
      <AdminUserDetail userId={id} />
    </SectionPage>
  );
}
