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
  // being `position: fixed; inset: 0` already fully covers/freezes it
  // visually — the lock below is only there to stop the *page underneath*
  // from actually scrolling (or its touch-scroll gesture from chaining
  // through past the overlay's own edge on mobile) while it's hidden.
  //
  // `overflow: hidden` on `body` alone is NOT enough to do that: setting
  // it while the page is scrolled down collapses body's scrollable
  // overflow immediately, and the browser resets `window.scrollY` to 0
  // as a direct side effect of that — not on close, on OPEN. The overlay
  // being full-viewport hid this visually for a moment, but the
  // underlying document really did jump to the top the instant the modal
  // opened; this is what read as "the landing page jumps to the bottom
  // when I click Get Started" (the visitor's real position was further
  // down the page, so snapping to 0 reads as a jump away from where they
  // were, and `close()`'s own `window.scrollTo(0, savedScrollY)` below
  // then correctly jumps back down to that position on close — which is
  // the other half of the reported symptom, not a separate bug).
  //
  // The fix is the standard body-scroll-lock technique: pin body with
  // `position: fixed` at a negative `top` equal to the captured scroll
  // offset. That freezes the page at its exact current position instead
  // of collapsing it to the top, and `overflow: hidden` is kept alongside
  // it purely to block the overscroll/rubber-band gesture handoff on
  // mobile (see .auth-overlay's own `overscroll-behavior: contain` for
  // the matching half of that).
  //
  // Restoring this MUST NOT depend on this component's cleanup running —
  // a previous version restored `body`'s styles only in this effect's
  // unmount cleanup, on the assumption that `router.back()` inside
  // `close()` would always unmount this component promptly. When that
  // assumption didn't hold (navigation delayed, blocked, or racing with
  // the transitionend/timeout fallback in `close()` below), the cleanup
  // never ran and `body` was left locked — the earlier "stuck, can't
  // scroll, needed a hard refresh" bug. That failure mode was about WHEN
  // the restore ran, not about `position: fixed` itself, so this version
  // keeps the explicit, synchronous restore-inside-`close()` discipline
  // that already fixed it (see `close()` below) rather than avoiding the
  // technique altogether. This effect only ever APPLIES the lock; a
  // tab-switch remount re-applies the same values (all overlay instances
  // agree on the locked styles, so re-applying is harmless and needs no
  // special-casing), and if this instance unmounts WITHOUT `close()`
  // having run first (there is no such path today, but this is the
  // safety net if one is ever added), the cleanup below still restores it
  // as a backstop.
  const scrollYRef = useRef(0);
  const previousBodyStyleRef = useRef({ overflow: "", position: "", top: "", width: "" });
  useEffect(() => {
    // Only ever capture scrollY on the FIRST lock in a given open
    // session — a tab-switch remount must not re-capture it, since by
    // then the page is already visually frozen at the original position
    // and re-reading `window.scrollY` here would just read back 0 (body
    // is already pinned via `position: fixed` at that point, so it no
    // longer reports the real offset) — this guard is what avoids that
    // clobbering both `scrollYRef` and the sessionStorage copy `close()`
    // reads from on the later, real close.
    const alreadyLocked = sessionStorage.getItem(OPEN_MARKER) === "1";
    const y = alreadyLocked
      ? Number(sessionStorage.getItem("auth-modal-scroll-y") ?? 0)
      : window.scrollY;
    if (!alreadyLocked) {
      scrollYRef.current = y;
      sessionStorage.setItem("auth-modal-scroll-y", String(y));
    }

    previousBodyStyleRef.current = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${y}px`;
    document.body.style.width = "100%";

    return () => {
      // Backstop only — see comment above. `close()` already restores
      // this synchronously in the normal flow, so this is a no-op then;
      // it only does something if this instance is ever unmounted some
      // other way (browser back/forward gesture bypassing `close()`,
      // for instance) without that having run first.
      const prev = previousBodyStyleRef.current;
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
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
      // Restore the scroll lock HERE, synchronously, rather than only in
      // the scroll-lock effect's unmount cleanup — this is guaranteed to
      // run exactly once, right before the actual navigation, regardless
      // of whether/when `router.back()` below goes on to unmount this
      // component. See that effect's comment for why relying on unmount
      // timing alone previously left `body` stuck locked.
      //
      // Order matters: unpin `position: fixed` FIRST (which drops body
      // back into normal document flow, at whatever scroll position the
      // browser now reports — typically 0, since it was pinned), THEN
      // `scrollTo` the real saved offset. Doing it in the other order
      // would scroll while still pinned, which has no visible effect and
      // leaves the page at the top the instant it's unpinned.
      const prev = previousBodyStyleRef.current;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, Number(sessionStorage.getItem("auth-modal-scroll-y") ?? scrollYRef.current));
      sessionStorage.removeItem(OPEN_MARKER);
      sessionStorage.removeItem("auth-modal-scroll-y");
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
