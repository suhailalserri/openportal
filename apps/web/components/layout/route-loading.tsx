import { Skeleton } from "@/components/ui/skeleton";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Rendered by app/[locale]/(app)/loading.tsx and .../(admin)/loading.tsx
 * while a page (or a segment below it) suspends. Deliberately generic —
 * `loading.tsx` can't know which page is loading, so this mirrors
 * `SectionPage`'s own frame (title row + body) rather than guessing at
 * any one page's actual layout.
 */
export function RouteLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
