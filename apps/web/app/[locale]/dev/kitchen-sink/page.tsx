import { notFound } from "next/navigation";

import { KitchenSinkClient } from "./kitchen-sink-client";

/**
 * 404s outside development (per plan). Kept as a thin server wrapper so
 * the notFound() gate runs before any client bundle for this page ships,
 * rather than gating inside a "use client" component after the fact.
 */
export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <KitchenSinkClient />;
}
