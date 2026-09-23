import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminChannels } from "@/features/admin/channels";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminChannelsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.channelsPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminChannels />
    </SectionPage>
  );
}
