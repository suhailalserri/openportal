"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";
import { cn } from "@/lib/utils";

/**
 * apps/web/features/landing/components/landing-header-bar.tsx
 *
 * Client Component. Owns the scroll-reactive "morphing pill" behavior:
 * at the top of the page it is a transparent, full-width bar; after
 * 20px of scroll it shrinks to a centered 832px frosted pill with a
 * hairline ring and a soft compound shadow. Every property transitions
 * together on one 700ms cubic-bezier(0.16, 1, 0.3, 1) so nothing lands
 * out of sync.
 *
 * WHY `group` + `group-data-[scrolled=true]:...` instead of `data-*`
 * variants on each child: Tailwind's `data-[…]` variant matches the
 * SAME element it is applied to. Putting `data-scrolled` on the <header>
 * and wanting the inner <div>/<nav> to react means the inner elements
 * need a group-scoped variant — `group-data-[scrolled=true]:...` reads
 * the closest ancestor that has `group` AND the matching data attribute.
 *
 * WHY two `data-scrolled` values ("true"/"false" as strings): so the
 * attribute is always present and always inspectable in devtools, and
 * so the selector `group-data-[scrolled=true]` is unambiguous (an
 * attribute that is merely *present* vs. one that equals "true" behaves
 * differently if someone later adds a third state).
 *
 * The wrapper is `pointer-events-none` so the space around the shrunk
 * pill never blocks clicks on the page beneath it; the inner container
 * re-enables pointer events for the actual chrome.
 */
export interface LandingHeaderBarProps {
  locale: string;
  siteName: string;
  navLinks: { href: string; label: string }[];
  signInLabel: string;
  getStartedLabel: string;
  primaryNavAria: string;
}

export function LandingHeaderBar({
  locale,
  siteName,
  navLinks,
  signInLabel,
  getStartedLabel,
  primaryNavAria,
}: LandingHeaderBarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled ? "true" : "false"}
      className="group pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "max-w-7xl px-4 pt-0 md:px-6",
          "group-data-[scrolled=true]:max-w-[52rem] group-data-[scrolled=true]:px-3 group-data-[scrolled=true]:pt-3",
        )}
      >
        <nav
          aria-label={primaryNavAria}
          className={cn(
            "flex items-center justify-between gap-2 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "h-16 px-2",
            // Pill state: shorter, rounded, frosted, ringed, shadowed.
            "group-data-[scrolled=true]:h-12 group-data-[scrolled=true]:rounded-2xl",
            "group-data-[scrolled=true]:bg-background/60 group-data-[scrolled=true]:pr-1.5 group-data-[scrolled=true]:pl-4",
            "group-data-[scrolled=true]:ring-[0.5px] group-data-[scrolled=true]:ring-border/50",
            "group-data-[scrolled=true]:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.02)]",
            "dark:group-data-[scrolled=true]:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(0,0,0,0.02)]",
            "group-data-[scrolled=true]:backdrop-blur-2xl",
          )}
        >
          {/* ── Brand ────────────────────────────────────────────── */}
          <Link
            href={`/${locale}`}
            className="group/brand flex min-w-0 items-center gap-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center transition-transform duration-300 group-hover/brand:scale-105">
              <img
                src="/logo.svg"
                alt=""
                width={28}
                height={28}
                className="size-full object-contain"
              />
            </span>
            <span
              className="max-w-48 truncate text-sm font-semibold tracking-tight text-foreground"
              title={siteName}
            >
              {siteName}
            </span>
          </Link>

          {/* ── Center links (hidden on mobile) ──────────────────── */}
          <div className="hidden items-center gap-0.5 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-muted-foreground hover:text-foreground",
                  "min-w-0 truncate rounded-lg px-3 py-1.5 text-sm font-medium",
                  "transition-colors duration-200",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* ── Right cluster ────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden h-4 w-px bg-border/40 lg:block" />
            <LanguageSwitcher />
            <ThemeToggle />

            <div className="hidden h-4 w-px bg-border/40 sm:block" />

            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href={`/${locale}/auth/login`}>{signInLabel}</Link>
            </Button>

            <CtaButton size="default" asChild>
              <Link href={`/${locale}/auth/register`}>{getStartedLabel}</Link>
            </CtaButton>
          </div>
        </nav>
      </div>
    </header>
  );
}