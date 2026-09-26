"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *   looking at, without a round-trip to the server. The actual `back()`
 *   call is now deferred until the exit transition finishes (see
 *   `close()` below) rather than firing on click, so the overlay
 *   visibly fades/scales out instead of vanishing instantly.
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

  // Tab switches (login <-> register) land on a genuinely different
  // intercepted route (a separate page.tsx / form component), so React
  // unmounts THIS instance and mounts a new one — there's no avoiding
  // that remount without collapsing both routes into one. What made it
  // READ as "closes then reopens" is that the fresh instance always
  // replayed the full entrance fade/scale from scratch, on top of the
  // old instance vanishing with no exit transition at all. A
  // `sessionStorage` marker, set the instant this ever opens and only
  // cleared by an actual close, lets a same-session remount (i.e. a tab
  // switch) recognize "the overlay was already open a moment ago" and
  // skip straight to the open state — no re-entry animation — while a
  // genuinely fresh visit (marker absent) still gets the normal fade-in.
  const OPEN_MARKER = "auth-modal-open";
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(OPEN_MARKER) === "1"
  );
  // `closing`: drives the exit transition. `router.back()`/`router.push`
  // used to fire on click, which unmounts this component the same
  // instant — before the `opacity/transform` transition defined in
  // styles/auth.css ever got a frame to animate FROM. Flipping this to
  // true first re-triggers that same CSS transition in reverse (removing
  // `data-open="true"` below), and the actual navigation is deferred
  // until that transition's `transitionend` fires (with a timeout
  // fallback in case the event doesn't, e.g. reduced-motion users whose
  // transition duration is near-zero).
  const [closing, setClosing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return; // already marked open from a same-session remount
    const raf = requestAnimationFrame(() => {
      setOpen(true);
      sessionStorage.setItem(OPEN_MARKER, "1");
    });
    return () => cancelAnimationFrame(raf);
    // Intentionally only depends on mount: this must run once per
    // instance, not react to `open` changing later (that would re-fire
    // the entrance frame on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock the landing/app page's own scroll for as long as this overlay is
  // mounted. `mode="modal"` renders on top of a still-mounted page (that's
  // the whole point of the @modal intercepting route), and `.auth-overlay`
  // being `position: fixed` stops that page from being visibly scrolled —
  // but `overflow: hidden` on `body` ALONE only suppresses the scrollbar,
  // it does not pin the actual scroll offset: the body element is still
  // free to have its scrollTop end up wherever the browser feels like once
  // it's no longer scrollable (which is what produced the reported "opens
  // already scrolled to the footer" / "closing jumps from bottom to top"
  // bug — the offset silently drifted to 0 or to whatever the newly
  // fixed-position overlay's own layout happened to compute, and the old
  // code only ever restored the `overflow` property, never the position
  // itself). The standard robust fix: read the real `window.scrollY` at
  // the moment this locks, pin `body` at `position: fixed` offset by that
  // exact amount (so it LOOKS unmoved despite no longer being the
  // scrolling element), and on the way back out set `scrollY` back to that
  // captured number explicitly rather than trusting the browser to have
  // remembered it on its own.
  //
  // Only restores it on a REAL close (see the `closing` guard) — on a tab
  // switch this instance unmounts and a new one mounts in the same tick,
  // both locking scroll the same way, so restoring here unconditionally
  // would flash the landing page's real scroll position back into view
  // for a frame between the two instances. `closing` is only ever true on
  // the path that actually calls `close()` below, never on an ordinary
  // tab-switch unmount, so this only restores scroll when the overlay is
  // truly gone.
  const closingRef = useRef(closing);
  closingRef.current = closing;
  const scrollYRef = useRef(0);
  useEffect(() => {
    // Read once, from whichever instance mounts first in a given open
    // session — a tab-switch remount must NOT re-capture scrollY (by then
    // it would just be reading back the 0 this same lock already forced),
    // so the captured value is itself cached in sessionStorage alongside
    // the open marker, keyed off the same "was this session already open"
    // check `open`'s initializer above uses.
    const alreadyLocked = sessionStorage.getItem(OPEN_MARKER) === "1";
    const scrollY = alreadyLocked
      ? Number(sessionStorage.getItem("auth-modal-scroll-y") ?? "0")
      : window.scrollY;
    scrollYRef.current = scrollY;
    if (!alreadyLocked) sessionStorage.setItem("auth-modal-scroll-y", String(scrollY));

    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      if (!closingRef.current) return; // tab switch — next instance re-locks immediately
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollYRef.current);
      sessionStorage.removeItem(OPEN_MARKER);
      sessionStorage.removeItem("auth-modal-scroll-y");
    };
  }, []);

  const homeHref = `/${locale}`;

  // `router.back()`, not `router.replace()`: Next's intercepting-route
  // machinery (the `@modal` slot) ties the modal's mounted/unmounted
  // state to the actual history entry it intercepted, not just to the
  // current URL matching something else — replacing the URL out from
  // under it (even to a URL `@modal`'s own default.tsx would render null
  // for) does not reliably tell Next to un-render the slot, so the X
  // button just sat there doing nothing. `back()` is the one navigation
  // Next's interception correctly unwinds. Now deferred behind the exit
  // transition (see `closing` above) instead of firing immediately.
  const close = useCallback(() => {
    if (closing) return; // already closing — ignore a second click/backdrop tap
    setClosing(true);
    setOpen(false);

    let navigated = false;
    const navigate = () => {
      if (navigated) return;
      navigated = true;
      router.back();
    };

    const node = cardRef.current;
    if (node) {
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== node) return; // ignore bubbled transitions from children
        node.removeEventListener("transitionend", onEnd);
        navigate();
      };
      node.addEventListener("transitionend", onEnd);
    }
    // Fallback in case transitionend never fires (reduced-motion, a
    // transition-duration override, or no `cardRef.current` yet) — matches
    // the longest transition duration set in styles/auth.css (500ms) plus
    // a small margin.
    window.setTimeout(navigate, 550);
  }, [closing, router]);


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

      <div ref={cardRef} className="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
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
                // Tab switches replace the current history entry rather
                // than pushing a new one — without this, going
                // login → register → login → close stacks 3 modal
                // entries and a single `back()` in `close()` above only
                // unwinds the most recent tab switch instead of actually
                // closing the modal. `replace` keeps exactly one
                // modal-related entry on the stack no matter how many
                // times the visitor flips between tabs first.
                replace
                role="tab"
                aria-selected={activeTab === "signin"}
                className="auth-tab"
              >
                {t("login")}
              </Link>
              <Link
                href={`/${locale}/auth/register`}
                replace
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
