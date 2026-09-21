import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LEGAL_DOCS, getLegalDocMeta } from "@/features/legal/lib/registry";
import { readLegalDoc } from "@/features/legal/lib/read-doc";
import { LegalDocView } from "@/features/legal/components/legal-doc-view";

/**
 * apps/web/app/[locale]/(public)/legal/[doc]/page.tsx
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md). Rule L4: route files are
 * thin — everything beyond params handling and notFound() lives in
 * features/legal.
 *
 * English-only content (F16: the three documents have no Arabic version
 * yet) — an `ar` visitor still gets the page chrome (title, nav, footer)
 * in Arabic via next-intl, with an explicit notice above the English
 * document text explaining why it's English, rather than silently
 * serving English prose with no explanation.
 *
 * Static: the three slugs are fixed and the content only changes via a
 * deploy (sync-legal.ts is a build-time step), so generateStaticParams
 * pre-renders every locale x doc pair at `next build`.
 *
 * WHY setRequestLocale + full params (this was a production 500,
 * DYNAMIC_SERVER_USAGE): this app uses its own middleware instead of
 * next-intl's, which passes the locale in the `x-next-intl-locale`
 * request header. next-intl's `requestLocale` (i18n/request.ts, frozen)
 * therefore reads `headers()` unless setRequestLocale(locale) has been
 * called first. The layout's getMessages() did exactly that, and
 * generateStaticParams used to return only `{ doc }` (no `locale`), so
 * nothing was pre-rendered and the first request rendered the route
 * "statically" on demand, where headers() throws. Fix: emit `locale` too,
 * call setRequestLocale here AND in app/[locale]/layout.tsx, and set
 * dynamicParams = false so an on-demand render of this route can never
 * happen. If anything else in the tree ever touches headers()/cookies(),
 * `next build` now fails loudly instead of the page 500ing in production.
 */
const LOCALES = ["ar", "en"] as const;

export const dynamicParams = false;

interface Props {
  params: Promise<{ locale: string; doc: string }>;
}

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => LEGAL_DOCS.map((doc) => ({ locale, doc: doc.slug })));
}

export async function generateMetadata({ params }: Props) {
  const { locale, doc } = await params;
  const meta = getLegalDocMeta(doc);
  if (!meta) return {};
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: `${t(meta.titleKey)} | OpenPortal` };
}

export default async function LegalDocPage({ params }: Props) {
  const { locale, doc } = await params;
  setRequestLocale(locale);
  const meta = getLegalDocMeta(doc);
  if (!meta) notFound();

  const t = await getTranslations({ locale, namespace: "legal" });
  const markdown = readLegalDoc(meta.slug);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="t-h2 mb-2 text-foreground">{t(meta.titleKey)}</h1>

      {locale !== "en" ? (
        <p className="mb-6 rounded-[11px] border border-border bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
          {t("englishOnlyNotice")}
        </p>
      ) : null}

      {markdown ? (
        <LegalDocView markdown={markdown} />
      ) : (
        <p className="text-[13.5px] text-muted-foreground">{t("unavailable")}</p>
      )}
    </main>
  );
}
