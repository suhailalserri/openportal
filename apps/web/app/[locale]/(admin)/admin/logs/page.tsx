import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminLogs } from "@/features/admin/logs";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminLogsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.logsPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminLogs />
    </SectionPage>
  );
}
