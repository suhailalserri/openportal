import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminWelcomeBonus } from "@/features/admin/welcome-bonus";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminWelcomeBonusPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.welcomeBonusPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminWelcomeBonus />
    </SectionPage>
  );
}
