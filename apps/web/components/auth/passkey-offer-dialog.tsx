"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { authClient, useSession } from "@/lib/auth-client";
import { PASSKEY_ENABLED, isPasskeySupported } from "@/lib/passkey-support";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * One-time "set up a passkey?" card, shown right after a new account first
 * lands in the app (mounted in the (app) layout).
 *
 * Shown only when ALL of these hold:
 *   - passkeys are enabled for this build and the browser supports WebAuthn
 *   - the account is new (created within NEW_ACCOUNT_WINDOW_MS) — existing
 *     users find passkeys in Settings → Security instead of being nagged
 *   - this browser hasn't already answered for this user (localStorage flag)
 *   - the user has no passkey yet (also proves the passkey backend works: if
 *     listing fails, e.g. the table isn't migrated, the card stays hidden)
 *
 * "Continue with password" (or closing the card) does nothing except record
 * the answer so it isn't shown again. "Set up a passkey" runs the browser's
 * WebAuthn prompt. The flag is per browser, not per account — a deliberate
 * trade-off to avoid a new database column.
 */
const NEW_ACCOUNT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const storageKey = (userId: string) => `passkey-offer:${userId}`;

function hasAnswered(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false; // storage blocked (private mode) — fall back to showing it
  }
}

function markAnswered(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // storage blocked — the card may reappear next visit, which is harmless
  }
}

type Phase = "offer" | "working" | "done";

export function PasskeyOfferDialog() {
  const t = useTranslations("auth.passkey");
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const createdMs = session?.user?.createdAt ? new Date(session.user.createdAt).getTime() : null;

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("offer");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!PASSKEY_ENABLED || !userId || createdMs === null) return;
    if (!isPasskeySupported()) return;
    if (Number.isNaN(createdMs) || Date.now() - createdMs > NEW_ACCOUNT_WINDOW_MS) return;

    const key = storageKey(userId);
    if (hasAnswered(key)) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await authClient.passkey.listUserPasskeys();
        if (cancelled || error || !data) return;
        if (data.length > 0) {
          markAnswered(key);
          return;
        }
        setOpen(true);
      } catch {
        // passkeys unavailable — never block the app over an optional offer
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, createdMs]);

  function dismiss() {
    if (userId) markAnswered(storageKey(userId));
    setOpen(false);
  }

  async function setUp() {
    setPhase("working");
    setFailed(false);
    try {
      const { error } = await authClient.passkey.addPasskey();
      if (error) {
        setPhase("offer");
        setFailed(true);
        return;
      }
      if (userId) markAnswered(storageKey(userId));
      setPhase("done");
    } catch {
      setPhase("offer");
      setFailed(true);
    }
  }

  function onOpenChange(next: boolean) {
    if (next) return;
    if (phase === "working") return; // don't abandon a browser prompt mid-flight
    if (phase === "done") setOpen(false);
    else dismiss();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {phase === "done" ? (
          <div className="grid gap-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
            <DialogHeader className="items-center text-center">
              <DialogTitle>{t("doneTitle")}</DialogTitle>
              <DialogDescription>{t("doneMessage")}</DialogDescription>
            </DialogHeader>
            <Button onClick={() => setOpen(false)}>{t("done")}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <KeyRound className="size-4" aria-hidden="true" />
                </span>
                <Badge>{t("badge")}</Badge>
              </div>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("subtitle")}</DialogDescription>
            </DialogHeader>

            {failed ? (
              <p role="alert" className="text-sm text-destructive">
                {t("setupFailed")}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Button onClick={setUp} disabled={phase === "working"} aria-busy={phase === "working"}>
                {phase === "working" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-4" aria-hidden="true" />
                )}
                {t("setup")}
              </Button>
              <Button variant="outline" onClick={dismiss} disabled={phase === "working"}>
                {t("usePassword")}
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">{t("explainer")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
