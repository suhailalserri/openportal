import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminPackages } from "@/features/admin/packages";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminPackagesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.packagesPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminPackages />
    </SectionPage>
  );
}
