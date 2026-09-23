"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExportDataButton } from "./export-data-button";
import { DeleteAccountDialog } from "./delete-account-dialog";

/**
 * apps/web/features/settings/sections/data-privacy/index.tsx (Phase 7.2)
 *
 * Kept named "Data & Privacy" per the plan's own note: "the Privacy
 * Policy points to *Settings > Data & Privacy*" — renaming this
 * section would silently break that cross-reference.
 */
export function DataPrivacySection() {
  const t = useTranslations("settings.data");
  const locale = useLocale();

  const legalDocs = [
    { slug: "terms", label: t("legal.terms") },
    { slug: "privacy", label: t("legal.privacy") },
    { slug: "acceptable-use", label: t("legal.acceptableUse") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t("exportTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("exportDescription")}</p>
          <ExportDataButton />
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t("legal.title")}</p>
          <ul className="flex flex-col gap-1">
            {legalDocs.map((doc) => (
              <li key={doc.slug}>
                <Link href={`/${locale}/legal/${doc.slug}`} className="text-sm text-primary underline-offset-4 hover:underline">
                  {doc.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-destructive">{t("deleteTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("deleteDescription")}</p>
          <DeleteAccountDialog />
        </div>
      </CardContent>
    </Card>
  );
}
