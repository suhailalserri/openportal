import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminFeatures } from "@/features/admin/features";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminFeaturesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.featuresPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminFeatures />
    </SectionPage>
  );
}
