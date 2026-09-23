import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminCodeBatchDetail } from "@/features/admin/codes/batch-detail";

interface Props {
  params: Promise<{ locale: string; batchId: string }>;
}

export default async function AdminCodeBatchPage({ params }: Props) {
  const { locale, batchId } = await params;
  const t = await getTranslations({ locale, namespace: "admin.codesPage" });

  return (
    <SectionPage title={t("batchTitle")}>
      <AdminCodeBatchDetail batchId={batchId} />
    </SectionPage>
  );
}
