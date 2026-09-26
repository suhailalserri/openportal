"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Popup-style chrome shared by /auth/login and /auth/register (Session
 * "restyle 2", replacing the plain <Card> layout with the approved
 * "Gateway" auth-modal design — see styles/auth.css for the token
 * mapping).
 *
 * login/register stay real, separate routes (guards, useSearchParams,
 * SSR redirect-if-signed-in all keep working unchanged) even in
 * `mode="modal"` — Next's intercepting routes render this same route at
 * a `@modal` parallel-route slot instead of replacing the page, which is
 * what actually keeps the marketing page mounted underneath. All this
 * component changes based on `mode` is how "closing" behaves:
 *
 * - `mode="page"` (default; used by the direct-route fallback, e.g. a
 *   deep link or a hard refresh of /auth/login with no landing page to
 *   go back to): the backdrop/close button navigate to the marketing
 *   home page, same as before.
 * - `mode="modal"` (used by the @modal-slot interceptor): there IS a
 *   page underneath, so closing calls `router.back()` instead — that
 *   dismisses the modal and lands back on whatever the visitor was
 *   looking at, without a round-trip to the server.
 *
 * `activeTab` picks which of the two tab links is highlighted; pass
 * `hideTabs` for the mid-flow states (2FA code entry) where switching
 * accounts mid-step doesn't make sense.
 */
export function AuthShell({
  locale,
  activeTab,
  hideTabs = false,
  mode = "page",
  children,
}: {
  locale: string;
  activeTab?: "signin" | "signup";
  hideTabs?: boolean;
  mode?: "page" | "modal";
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const tApp = useTranslations("app");
  const router = useRouter();
  // Mount closed, then flip to open a tick later so the entrance
  // transition (defined in styles/auth.css) actually plays instead of
  // the card just appearing pre-rendered as "open".
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Lock the landing/app page's own scroll for as long as this overlay is
  // mounted. `mode="modal"` renders on top of a still-mounted page (that's
  // the whole point of the @modal intercepting route), and `.auth-overlay`
  // being `position: fixed` stops that page from being visibly scrolled —
  // but on mobile the touch-scroll *gesture* itself isn't blocked by that
  // alone, so scrolling to the end of the modal's own content (e.g. the
  // register form's checklist/terms/Turnstile) was chaining straight into
  // the page underneath: the reported "background moves while I scroll the
  // popup" bug. Restores the previous inline value on unmount rather than
  // clearing it outright, in case something else on the page already had
  // an opinion on `body.style.overflow`.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const homeHref = `/${locale}`;
  // router.back() only pops one history entry — if the visitor switched
  // between the login/signup tabs (each a Link, i.e. its own push) before
  // hitting close, one "back" just lands on the previous tab's modal
  // state instead of leaving the modal, so it looks like the X needs to
  // be clicked repeatedly. Route to the underlying page directly instead;
  // it's an intercepted route, so this still keeps that page's own state.
  const close = () => router.replace(homeHref);

  return (
    <div className="auth-overlay" data-open={open ? "true" : "false"}>
      {mode === "modal" ? (
        <button
          type="button"
          onClick={close}
          aria-label={t("closeDialog")}
          className="auth-backdrop"
        />
      ) : (
        <Link href={homeHref} aria-label={t("closeDialog")} className="auth-backdrop" />
      )}

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
          {mode === "modal" ? (
            <button type="button" onClick={close} className="auth-close" aria-label={t("closeDialog")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <Link href={homeHref} className="auth-close" aria-label={t("closeDialog")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Link>
          )}

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
