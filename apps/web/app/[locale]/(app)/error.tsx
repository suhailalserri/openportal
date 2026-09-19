/**
 * Phase 2.2. Next.js route-group error boundary — must be a Client
 * Component (Next requirement for error.tsx), satisfied by re-exporting
 * RouteError (already "use client") rather than duplicating markup here.
 * Renders inside AppShell: the (app)/layout.tsx tree above this boundary
 * (sidebar/header) stays mounted; only the segment below it is replaced.
 */
import { RouteError } from "@/components/layout/route-error";

export default RouteError;
