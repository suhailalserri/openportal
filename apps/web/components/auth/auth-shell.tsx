"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Popup-style chrome shared by /auth/login and /auth/register (Session
 * "restyle 2", replacing the plain <Card> layout with the approved
 * "Gateway" auth-modal design — see styles/auth.css for the token
 * mapping).
 *
 * login/register stay real, separate routes (guards, useSearchParams,
 * SSR redirect-if-signed-in all keep working unchanged) — this component
 * only supplies the glass card / brand panel / tab chrome around
 * whatever form markup each page passes as `children`. Because there's
 * no page "underneath" to reveal, the backdrop and close button both
 * navigate to the marketing home page rather than toggling visibility,
 * which is the closest equivalent to "closing" a modal that's actually a
 * full route.
 *
 * `activeTab` picks which of the two tab links is highlighted; pass
 * `hideTabs` for the mid-flow states (2FA code entry) where switching
 * accounts mid-step doesn't make sense.
 */
export function AuthShell({
  locale,
  activeTab,
  hideTabs = false,
  children,
}: {
  locale: string;
  activeTab: "signin" | "signup";
  hideTabs?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const tApp = useTranslations("app");
  // Mount closed, then flip to open a tick later so the entrance
  // transition (defined in styles/auth.css) actually plays instead of
  // the card just appearing pre-rendered as "open".
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const homeHref = `/${locale}`;

  return (
    <div className="auth-overlay" data-open={open ? "true" : "false"}>
      <Link href={homeHref} aria-label={t("closeDialog")} className="auth-backdrop" />

      <div className="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        {/* Left: brand panel */}
        <aside className="auth-brand">
          <div className="auth-brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" aria-hidden="true" />
          </div>
          <h2 className="auth-brand-name">{tApp("nameEn")}</h2>
          <p className="auth-brand-tag">{t("brandTagline")}</p>

          <ul className="auth-brand-features">
            {(t.raw("brandFeatures") as string[]).map((feature) => (
              <li key={feature}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="auth-brand-foot">© {new Date().getFullYear()} OpenPortal</div>
        </aside>

        {/* Right: form panel */}
        <div className="auth-form-panel">
          <Link href={homeHref} className="auth-close" aria-label={t("closeDialog")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Link>

          {!hideTabs ? (
            <div className="auth-tabs" role="tablist">
              <Link
                href={`/${locale}/auth/login`}
                role="tab"
                aria-selected={activeTab === "signin"}
                className="auth-tab"
              >
                {t("login")}
              </Link>
              <Link
                href={`/${locale}/auth/register`}
                role="tab"
                aria-selected={activeTab === "signup"}
                className="auth-tab"
              >
                {t("register")}
              </Link>
            </div>
          ) : null}

          <div className="auth-view">{children}</div>
        </div>
      </div>
    </div>
  );
}
