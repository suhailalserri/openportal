import { MICRO_CREDIT } from "@ai-platform/config";

import { publicCaller } from "@/lib/trpc-server";
import { formatCredits, formatYer } from "@/lib/format";

import { PLACEHOLDER_TOTAL_USERS, SHOW_TOTAL_USERS } from "../config/placeholders";
import type { LandingData } from "../types";
import { buildLandingData } from "./build-landing-data";

/**
 * apps/web/features/landing/lib/landing-data.ts
 *
 * Phase 3.3. ONE round of public reads for the whole landing page (3.2
 * had ModelGrid and PackageGrid each fetching separately; the new
 * sections — stats, table, calculator, packages, payment marquee — all
 * need the same three datasets, and the calculator needs models AND
 * packages together, so they are fetched once here and handed down).
 *
 * SERVER ONLY, by contract and comment (same convention as
 * lib/trpc-server.ts — `server-only` is not a dependency here): it opens
 * a DB connection through publicCaller. Never import it from a
 * "use client" file.
 *
 * NO REQUEST-SCOPED READS: no headers()/cookies() — the same thing that
 * caused the legal-pages DYNAMIC_SERVER_USAGE 500 in 3.2. The locale is
 * passed in explicitly from the route params.
 *
 * GRACEFUL DEGRADATION: a marketing page should not 500 because one
 * public query failed. Each read is settled independently; a failure is
 * logged and that section falls back to its empty state (the sections
 * already render one). This does not hide a genuinely broken database
 * from CI — e2e/landing.spec.ts asserts a seeded model appears.
 */
export async function getLandingData(locale: string): Promise<LandingData> {
  const localeTag = locale === "ar" ? "ar" : "en";

  const [models, packages, methods] = await Promise.allSettled([
    publicCaller.models.list(),
    publicCaller.billing.listPackages(),
    publicCaller.billing.listPaymentMethods(),
  ]);

  const unwrap = <T,>(label: string, r: PromiseSettledResult<T[]>): T[] => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[landing] ${label} failed:`, r.reason);
    return [];
  };

  return buildLandingData(
    unwrap("models.list", models),
    unwrap("billing.listPackages", packages),
    unwrap("billing.listPaymentMethods", methods),
    {
      locale: localeTag,
      microPerCredit: MICRO_CREDIT,
      formatYer,
      formatCredits,
      totalUsers: SHOW_TOTAL_USERS ? PLACEHOLDER_TOTAL_USERS : null,
    },
  );
}
