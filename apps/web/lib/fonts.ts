/**
 * openportal — font loading
 * Phase 1.1 (docs/FRONTEND_REBUILD_PLAN.md)
 *
 * Fixes F14: the legacy app/globals.css requests the Google Fonts family
 * `IBM+Plex+Arabic`, which does not exist under that name — Google Fonts
 * lists it as "IBM Plex Sans Arabic". That typo makes Arabic text silently
 * fall back to the system font in production, with no error anywhere.
 *
 * next/font/google resolves the family at build time, so getting the name
 * wrong here fails `next build` instead of failing silently in the browser
 * — which is the actual fix, not just the corrected string.
 *
 * NOT wired into app/[locale]/layout.tsx yet. The legacy globals.css
 * (which currently owns font loading via @import) is deleted in 1.2 per
 * the plan ("delete the legacy ... globals.css"); wiring these exports
 * into the root layout's <html> className happens there, in the same
 * commit that removes the old @import, so the app is never mid-migration
 * with two font-loading mechanisms active at once.
 */

import { Fraunces, IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from "next/font/google";

// Display / headline serif — matches the reference design's Fraunces
// heading treatment (docs/design/design-preview.html §1: --font-display).
// Was missing entirely before, so every heading silently fell back to
// Inter — the single biggest visible gap versus the reference file.
export const fontDisplay = Fraunces({
  subsets: ["latin"],
  // Fraunces is a variable font; not every weight has a static italic
  // instance published (e.g. 500/italic), which crashes next/font/google's
  // static-face lookup with "Cannot read properties of null (reading '1')".
  // "variable" loads the full weight axis instead of enumerating instances.
  weight: "variable",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

// Arabic UI text. Verified available weights for this family are
// 100/200/300/400/500/600/700 (not a variable font) — only requesting
// what globals.css actually used (400/500/600/700).
export const fontArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

// Latin UI text.
export const fontInter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

// Code blocks (Rule 7 in the plan: code stays dir="ltr" regardless of
// document direction, so no Arabic variant is needed here).
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Combined className for <html>, e.g.:
 *   <html className={fontVariables}>
 * Applied in 1.2 alongside the globals.css deletion.
 */
export const fontVariables = [
  fontDisplay.variable,
  fontArabic.variable,
  fontInter.variable,
  fontMono.variable,
].join(" ");
