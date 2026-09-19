"use client";

/**
 * Phase 2.2. Next.js route-group error boundary. "use client" is
 * required literally in THIS file — Next's app-router compiler checks
 * the boundary file itself, not whether the component it renders is
 * already a Client Component (a re-export of RouteError without this
 * directive fails the build: "must be a Client Component", first hit on
 * the Vercel preview build). Renders inside AppShell: the (app)/layout.tsx
 * tree above this boundary (sidebar/header) stays mounted; only the
 * segment below it is replaced.
 */
import { RouteError } from "@/components/layout/route-error";

export default RouteError;
