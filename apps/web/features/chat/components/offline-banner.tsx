"use client";

import { useTranslations } from "next-intl";

import { useOnlineStatus } from "../hooks/use-online-status";

/**
 * apps/web/features/chat/components/offline-banner.tsx
 *
 * Phase 4b. Renders nothing while online — the caller mounts it once,
 * near the top of the chat view, and it appears/disappears on its own.
 * `chat.offline` already exists in messages/{ar,en}.json (Phase 3
 * scaffolding) — no new i18n keys needed for this phase.
 */
export function OfflineBanner() {
  const t = useTranslations("chat");
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      className="rounded-[10px] border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning"
    >
      {t("offline")}
    </div>
  );
}
