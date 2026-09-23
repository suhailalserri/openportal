import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminCodes } from "@/features/admin/codes";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminCodesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.codesPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminCodes />
    </SectionPage>
  );
}
