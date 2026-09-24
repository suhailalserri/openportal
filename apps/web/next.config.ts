import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Phase 9.2b — UNFROZEN for two small edits, then re-frozen:
 *   1. `buildCsp()` connect-src also allows the origin of
 *      NEXT_PUBLIC_SENTRY_DSN. Without it, flipping the CSP below to
 *      enforcing would silently block every Sentry report.
 *   2. The export is wrapped in `withSentryConfig` ONLY when
 *      SENTRY_AUTH_TOKEN is set (source-map upload). CI, e2e and local
 *      builds have no token, so they export exactly what they did before.
 * The Sentry ingest origin is derived from the DSN, never hard-coded, so
 * EU/US/self-hosted projects all work.
 *
 * Phase 9.1 — only the `headers()` block below was edited (the rest of
 * this file stays frozen). See docs/frontend/HARDENING_CHECKLIST.md.
 *
 * CSP is shipped as REPORT-ONLY first: violations show in the browser
 * console but nothing is blocked. After the preview passes (register page
 * with Turnstile, chat stream, dashboard chart, 2FA QR, payment logos),
 * change CSP_HEADER_NAME to "Content-Security-Policy" to enforce.
 *
 * Honest limits of this policy: it is a STATIC policy (middleware.ts is
 * frozen, so no per-request nonce), so script-src/style-src must allow
 * 'unsafe-inline' — Next.js emits inline hydration scripts. What it does
 * buy: no third-party script origins except Cloudflare Turnstile, no
 * plugins, no framing, no form posts off-origin, no <base> hijack.
 * img-src allows any https: because admins paste arbitrary payment-method
 * logo URLs (features/billing/components/payment-method-logo.tsx).
 */
const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
  const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const turnstile = "https://challenges.cloudflare.com";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin ?? ""} ${sentryOrigin ?? ""} ${turnstile}`.replace(/\s+/g, " ").trim(),
    `frame-src ${turnstile}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",   // Required for Docker deployment
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.yourdomain.com" },
    ],
  },
  // Security headers (additional layer on top of Caddy)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: CSP_HEADER_NAME,          value: buildCsp() },
        ],
      },
    ];
  },
};

const withIntl = withNextIntl(nextConfig);

// tsconfig.base.json sets exactOptionalPropertyTypes, so an optional Sentry
// option must be ABSENT rather than `undefined` — hence the conditional spreads.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

export default sentryToken
  ? withSentryConfig(withIntl, {
      ...(sentryOrg ? { org: sentryOrg } : {}),
      ...(sentryProject ? { project: sentryProject } : {}),
      authToken: sentryToken,
      silent: !process.env.CI,
      telemetry: false,
      // Upload a wider set of client files so more stack frames resolve.
      widenClientFileUpload: true,
      // Maps are uploaded, then removed from the build output (not served).
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      // No tunnelRoute: it would proxy every report through our server.
    })
  : withIntl;
