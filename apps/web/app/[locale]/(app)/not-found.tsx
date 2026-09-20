/**
 * Phase 2.2. Renders inside (app)/layout.tsx (AppShell stays mounted) for
 * any path under the group that doesn't match a page — e.g. a stale
 * bookmark or typo under /chat.
 */
import { RouteNotFound } from "@/components/layout/route-not-found";

export default RouteNotFound;
