import { getTranslations } from "next-intl/server";

import { LandingHeaderBar } from "./landing-header-bar";

/**
 * apps/web/features/landing/components/landing-header.tsx
 *
 * Server Component. Fetches the two message namespaces the header needs
 * and passes plain strings down to <LandingHeaderBar>, which owns the
 * scroll-reactive morphing (and therefore must be a Client Component).
 *
 * Split rationale: this file must stay async to call getTranslations
 * (server-only). The bar must run useEffect to listen to scroll. Keeping
 * them in one file would force the whole thing client-side, which would
 * pull the message bundle into the client JS for the header alone.
 *
 * Nav links are hardcoded here (they used to come from
 * useTopNavLinks() in the app-shell version; the public landing doesn't
 * need backend-driven nav). Edit this array to change the header links.
 */
export async function LandingHeader({ locale }: { locale: string }) {
  const [t, tApp] = await Promise.all([
    getTranslations({ locale, namespace: "landing" }),
    getTranslations({ locale, namespace: "app" }),
  ]);

  const navLinks = [
    { href: "#models", label: t("table.colModel") },
    { href: "#pricing", label: t("packagesHeading") },
    { href: "#how", label: t("gateway.eyebrow") },
  ];

  return (
    <LandingHeaderBar
      locale={locale}
      siteName={tApp("name")}
      navLinks={navLinks}
      signInLabel={t("signIn")}
      getStartedLabel={t("getStarted")}
      primaryNavAria={t("primaryNav")}
    />
  );
}