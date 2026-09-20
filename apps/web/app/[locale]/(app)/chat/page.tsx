import { getTranslations } from "next-intl/server";

import { SectionPage } from "@/components/layout/section-page";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * PLACEHOLDER (Phase 2.1). Exists so `/{locale}/chat` resolves — without
 * a page the route 404s before the (app) layout guard ever runs — and so
 * the frozen middleware's `/` → `/{locale}/chat` redirect lands somewhere.
 * Replaced by features/chat in Phase 4 (4d owns the /chat and /chat/[id]
 * routes).
 */
export default async function ChatPlaceholderPage({ params }: Props) {
  const { locale } = await params;
  const [tNav, tShell] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "shell" }),
  ]);

  return <SectionPage title={tNav("chat")} description={tShell("placeholder.chat")} />;
}
