import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminModels } from "@/features/admin/models";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminModelsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.modelsPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminModels />
    </SectionPage>
  );
}
