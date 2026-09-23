import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminAudit } from "@/features/admin/audit";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminAuditPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.auditPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminAudit />
    </SectionPage>
  );
}
