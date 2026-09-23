import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminManualPayments } from "@/features/admin/manual-payments";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminManualPaymentsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.manualPaymentsPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminManualPayments />
    </SectionPage>
  );
}
