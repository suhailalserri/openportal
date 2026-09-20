/**
 * Shared across login/register/forgot/reset (Phase 3.1). No dedicated
 * `Alert` primitive exists in components/ui — this reuses the same
 * destructive color treatment BalanceWidget's zero-balance state and
 * RouteError already establish, rather than introducing a one-off style.
 */
export function FormErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={`rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive ${className ?? ""}`}
    >
      {message}
    </div>
  );
}
