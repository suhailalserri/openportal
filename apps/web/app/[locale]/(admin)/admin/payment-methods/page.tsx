import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";
import { AdminPaymentMethods } from "@/features/admin/payment-methods";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminPaymentMethodsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.paymentMethodsPage" });

  return (
    <SectionPage title={t("title")} description={t("description")}>
      <AdminPaymentMethods />
    </SectionPage>
  );
}
