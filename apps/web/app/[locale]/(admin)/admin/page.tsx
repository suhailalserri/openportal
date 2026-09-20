import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * PLACEHOLDER (Phase 2.1). Exists so `/{locale}/admin` resolves and the
 * (admin) layout guard can be exercised. Admin pages arrive in 8a-8c.
 */
export default async function AdminPlaceholderPage({ params }: Props) {
  const { locale } = await params;
  const [tNav, tShell] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "shell" }),
  ]);

  return <SectionPage title={tNav("adminOverview")} description={tShell("placeholder.admin")} />;
}
