import { Landmark, Wallet2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * apps/web/features/billing/components/payment-method-logo.tsx (Phase 5.2)
 *
 * `paymentMethods.logoUrl` (packages/db/src/schema/payment-methods.ts) is
 * nullable, and admin.router.ts validates it as `z.string().url()` when
 * set — there is no file-upload endpoint anywhere in this codebase yet
 * (no MinIO/S3 wiring reachable from either app despite infra/docker
 * mentioning MinIO — grep confirms nothing in apps/web or apps/api calls
 * it). So today, "uploading a logo" means hosting the PNG/SVG somewhere
 * with a stable HTTPS URL and pasting that URL into the (not-yet-built,
 * Phase 8b) admin payment-methods form — an admin can already set
 * `logoUrl` via `admin.paymentMethods.create/update`, there's just no UI
 * for it yet, only the tRPC procedure.
 *
 * Until that exists (or a real upload endpoint lands in a backend
 * session), this component is the buyer-facing fallback: renders the
 * method's logo if `logoUrl` is set, otherwise a neutral icon so the
 * picker never shows a broken-image glyph. Swap in real logos later by
 * just setting `logoUrl` — no component change needed.
 */
export function PaymentMethodLogo({
  logoUrl,
  name,
  className,
}: {
  logoUrl?: string | null;
  name: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external,
      // admin-supplied URLs of unknown host; next/image would need each
      // host allow-listed in next.config.ts (frozen for this session).
      <img
        src={logoUrl}
        alt={name}
        className={cn("size-8 shrink-0 rounded-md object-contain", className)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground",
        className
      )}
    >
      <Wallet2 className="size-4" />
    </div>
  );
}

/** Used where a bank/transfer-specific glyph reads better than the generic wallet (e.g. manual-transfer method with no logo). */
export function PaymentMethodFallbackIcon({ className }: { className?: string }) {
  return <Landmark aria-hidden="true" className={cn("size-4", className)} />;
}
