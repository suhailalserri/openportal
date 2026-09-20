import { notFound } from "next/navigation";

import { KitchenSinkClient } from "./kitchen-sink-client";

/**
 * Gate note: `NODE_ENV === "production"` does NOT distinguish "a real
 * public deployment" from "a Vercel build" — Vercel builds EVERY
 * deployment (preview and production) with NODE_ENV=production, so that
 * check hid this page everywhere except a local `next dev` server,
 * including the exact preview/production URLs it exists to let you
 * QA on. Fixed by defaulting to visible and requiring an explicit env
 * var to hide it, rather than the reverse.
 *
 * Before Phase 2 puts real, publicly-linked content behind this app,
 * either delete this page or replace this with a real gate (shared
 * password / cookie / middleware check) — an env var default-open is
 * fine for a construction-site deployment nobody is being sent to yet,
 * not for a live product.
 */
export default function KitchenSinkPage() {
  if (process.env.HIDE_KITCHEN_SINK === "true") notFound();

  return <KitchenSinkClient />;
}
