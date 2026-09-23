"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { getPublicApiBaseUrl, buildCurlExample } from "./api-base-url";

/**
 * apps/web/features/settings/sections/api-access/index.tsx (Phase 7.2)
 *
 * F17 (audit finding): the only endpoint a raw API key can call is the
 * Fastify service's own `POST /chat` — custom body, `text/plain` stream,
 * NOT an OpenAI-compatible surface. This card's copy says exactly that;
 * it deliberately does NOT say "OpenAI-compatible" anywhere (§6 Phase
 * 7.2: "telling users the API is OpenAI-compatible when it isn't
 * produces support load and refund requests").
 *
 * The raw key only ever exists in `generateApiKey`'s mutation result
 * (component state, `rawKey` below) — never written back into any
 * cache/query data, so closing the dialog is the only "shown once"
 * enforcement needed; a refetch of `getApiKeyInfo` can only ever return
 * the prefix.
 */
export function ApiAccessSection() {
  const t = useTranslations("settings.apiAccess");
  const utils = trpc.useUtils();
  const { data: info, isLoading } = trpc.user.getApiKeyInfo.useQuery();

  const [rawKey, setRawKey] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const generate = trpc.user.generateApiKey.useMutation({
    onSuccess: async (data) => {
      setRawKey(data.key);
      await utils.user.getApiKeyInfo.invalidate();
    },
  });
  const revoke = trpc.user.revokeApiKey.useMutation({
    onSuccess: async () => {
      setRevokeOpen(false);
      await utils.user.getApiKeyInfo.invalidate();
    },
  });

  const baseUrl = getPublicApiBaseUrl();

  if (isLoading || !info) {
    return <Skeleton className="h-56 w-full rounded-[14px]" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        <div className="flex items-center gap-3">
          {info.hasKey ? (
            <>
              <Badge variant="secondary" className="font-mono">{info.prefix}</Badge>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setRevokeOpen(true)}
                disabled={revoke.isPending}
              >
                {t("revoke")}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? t("generating") : t("generate")}
            </Button>
          )}
        </div>
        {generate.isError && <p className="text-xs text-destructive">{t("errors.generic")}</p>}
        {info.hasKey && (
          <p className="text-xs text-muted-foreground">{t("regenerateHint")}</p>
        )}

        <div className="rounded-[10px] border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium text-foreground">{t("docsTitle")}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t("docsDescription")}</p>
          {baseUrl ? (
            <pre dir="ltr" className="overflow-x-auto rounded-[8px] bg-background p-2 text-xs">
              <code>{buildCurlExample(baseUrl, info.prefix ?? "sk-aip-xxxxxxxxxxxxxx")}</code>
            </pre>
          ) : (
            <p className="text-xs text-warning">{t("docsNotConfigured")}</p>
          )}
        </div>
      </CardContent>

      {/* Shown-once key dialog */}
      <Dialog open={rawKey !== null} onOpenChange={(open) => !open && setRawKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("dialog.description")}</p>
          <pre dir="ltr" className="overflow-x-auto rounded-[8px] border border-border bg-muted/40 p-2 text-xs">
            <code>{rawKey}</code>
          </pre>
          <Button
            type="button" variant="outline" size="sm" className="w-fit"
            onClick={() => rawKey && void navigator.clipboard.writeText(rawKey)}
          >
            {t("dialog.copy")}
          </Button>
          <DialogFooter>
            <Button type="button" onClick={() => setRawKey(null)}>{t("dialog.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("revokeDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("revokeDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => revoke.mutate()} disabled={revoke.isPending}>
              {t("revokeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
