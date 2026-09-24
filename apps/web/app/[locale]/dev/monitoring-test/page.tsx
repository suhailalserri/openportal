import { notFound } from "next/navigation";

import { MonitoringTestClient } from "./monitoring-test-client";

/**
 * Phase 9.2b "done when" preview. Same env-gate as the other /dev pages
 * (HIDE_KITCHEN_SINK — see kitchen-sink/page.tsx for why NODE_ENV can't be
 * used on Vercel). This is now the FOURTH page sharing that variable; the
 * planned split into HIDE_DEV_PAGES is still open (see BRANCH_AND_CI_NOTES).
 *
 * `?throw=server` throws during server render, exercising `onRequestError`.
 */
export default async function MonitoringTestPage({
  searchParams,
}: {
  searchParams: Promise<{ throw?: string }>;
}) {
  if (process.env.HIDE_KITCHEN_SINK === "true") notFound();

  const { throw: mode } = await searchParams;
  if (mode === "server") {
    throw new Error("Monitoring test: server render error (expected)");
  }

  return <MonitoringTestClient />;
}
