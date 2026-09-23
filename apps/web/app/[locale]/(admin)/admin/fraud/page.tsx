import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminFraud } from "@/features/admin/fraud";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminFraudPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.fraudPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminFraud />
    </SectionPage>
  );
}
