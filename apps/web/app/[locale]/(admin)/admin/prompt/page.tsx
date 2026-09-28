import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminPrompt } from "@/features/admin/prompt";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminPromptPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.promptPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminPrompt />
    </SectionPage>
  );
}
