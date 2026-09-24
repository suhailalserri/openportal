"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { signIn } from "@/lib/auth-client";
import { PASSKEY_ENABLED, isPasskeySupported } from "@/lib/passkey-support";
import { Button } from "@/components/ui/button";

/**
 * "Sign in with a passkey" — login page only. Uses the discoverable-credential
 * flow (no email needed): the browser shows the passkeys it holds for this
 * site and the user picks one. Renders nothing unless passkeys are enabled
 * for this build AND the browser supports WebAuthn.
 *
 * Passkey creation is NOT offered on the register page: a passkey has to be
 * attached to an existing account, so it is offered right after the first
 * sign-in instead (components/auth/passkey-offer-dialog.tsx).
 */
export function PasskeySignIn({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError?: (message: string) => void;
}) {
  const t = useTranslations("auth.passkey");
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setSupported(isPasskeySupported());
  }, []);

  if (!PASSKEY_ENABLED || !supported) return null;

  async function onClick() {
    setPending(true);
    try {
      const { error } = await signIn.passkey();
      if (error) {
        onError?.(t("signInFailed"));
        return;
      }
      onSuccess();
    } catch {
      onError?.(t("signInFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="mt-3 w-full"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <KeyRound className="size-4" aria-hidden="true" />
      )}
      {t("signIn")}
    </Button>
  );
}
