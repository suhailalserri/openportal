/**
 * Replaces the generic lucide `Loader2` spinner on the login/register
 * submit buttons with the project's own animated logo mark (public/logo-
 * anim-*.svg), per the "loading animation from the project logo" ask.
 *
 * Two of the pre-made animated marks are used, picked for what they read
 * as at a glance:
 *  - "signin"  → logo-anim-06-orbit-trail-single.svg (a single trail
 *    circling the mark) — reads as "checking", fits a quick credentials
 *    lookup.
 *  - "signup"  → logo-anim-04-progress-fill.svg (the mark filling in) —
 *    reads as "building", fits creating a new account.
 *
 * Plain <img>, not next/image: these SVGs carry their own baked-in SMIL/
 * CSS animation, which next/image's optimizer isn't guaranteed to
 * preserve, and they're small, local, and already the right size.
 */
import { cn } from "@/lib/utils";

const VARIANT_SRC = {
  signin: "/logo-anim-06-orbit-trail-single.svg",
  signup: "/logo-anim-04-progress-fill.svg",
} as const;

export function LogoSpinner({
  variant,
  className,
}: {
  variant: keyof typeof VARIANT_SRC;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={VARIANT_SRC[variant]}
      alt=""
      aria-hidden="true"
      className={cn("h-5 w-auto shrink-0", className)}
    />
  );
}
