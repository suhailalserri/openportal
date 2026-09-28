"use client";

import { useEffect } from "react";
import { captureReferralFromLocation } from "@/lib/referral";

/**
 * apps/web/providers/referral-capture.tsx
 *
 * Renders nothing. Mounted once in app/[locale]/layout.tsx (same
 * pattern as ThemePresetSync) so it runs on every page, not just the
 * landing page — a `?ref=` link could point anywhere. See lib/referral.ts
 * for why this exists: middleware.ts losing the query string on the
 * bare-`/` redirect was only half the bug; this is the other half
 * (landing-page CTAs don't forward `ref` to /auth/register either).
 */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromLocation();
  }, []);
  return null;
}
