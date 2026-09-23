"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Laptop } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { formatDate } from "@/lib/format";

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  current: boolean;
}

/**
 * apps/web/features/settings/sections/security/active-sessions-list.tsx (Phase 7.1)
 *
 * Talks to `GET/DELETE /api/user/sessions` and `DELETE
 * /api/user/sessions/[id]` — NOT `authClient.listSessions()` /
 * `authClient.revokeSession()`. Those routes' own comments explain why:
 * better-auth's client only returns a real `token` for the CALLER's own
 * current session (every other row's token is blanked for security), and
 * `revokeSession` requires a token — so a generic "revoke any of my
 * devices" UI is impossible to build against the client API alone. The
 * REST routes read the `sessions` table directly server-side and key
 * off each row's internal `id` instead, which is what makes per-device
 * revoke actually work here.
 */
export function ActiveSessionsList() {
  const t = useTranslations("settings.security.sessions");
  const locale = useLocale() as "ar" | "en";

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  async function load() {
    setError(false);
    try {
      const res = await fetch("/api/user/sessions");
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { sessions: SessionRow[] };
      setSessions(body.sessions);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revokeOne(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/user/sessions/${id}`, { method: "DELETE" });
      if (res.ok) setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeAllOthers() {
    setRevokingAll(true);
    try {
      const res = await fetch("/api/user/sessions", { method: "DELETE" });
      if (res.ok) setSessions((prev) => prev?.filter((s) => s.current) ?? null);
    } finally {
      setRevokingAll(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        {sessions && sessions.length > 1 && (
          <Button type="button" variant="ghost" size="sm" disabled={revokingAll} onClick={revokeAllOthers}>
            {revokingAll ? t("revoking") : t("revokeAllOthers")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <FormErrorBanner message={t("error")} />}
        {!sessions && !error && <Skeleton className="h-24 w-full rounded-[11px]" />}
        {sessions?.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-[11px] border border-input p-3">
            <div className="flex items-start gap-3 min-w-0">
              <Laptop className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{s.userAgent ?? t("unknownDevice")}</p>
                <p className="text-xs text-muted-foreground">
                  {s.ip ?? "—"} · {t("lastActive")} {formatDate(s.updatedAt, locale)}
                </p>
              </div>
            </div>
            {s.current ? (
              <Badge variant="success">{t("thisDevice")}</Badge>
            ) : (
              <Button type="button" variant="ghost" size="sm" disabled={revokingId === s.id} onClick={() => revokeOne(s.id)}>
                {revokingId === s.id ? t("revoking") : t("revoke")}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
