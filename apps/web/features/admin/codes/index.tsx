"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCredits } from "@/lib/format";
import { downloadCsv, buildCsv } from "@/lib/csv";
import { usePackages } from "../packages/hooks/use-packages";
import { usePaymentMethods } from "../payment-methods/hooks/use-payment-methods";
import { useCodeBatches } from "./hooks/use-code-batches";
import { useGenerateCodes } from "./hooks/use-generate-codes";

const NONE = "__none__";

/**
 * apps/web/features/admin/codes/index.tsx (Phase 8b)
 *
 * Batches table (aggregates only — `listCodeBatches`) + the generate
 * dialog. On a successful generate, offers an immediate CSV of the
 * brand-new codes (the only moment this page ever holds bare code
 * strings in memory) instead of making the admin re-open the batch to
 * get them.
 */
export function AdminCodes() {
  const t = useTranslations("admin.codesPage");
  const locale = useLocale();
  const router = useRouter();
  const { batches, isLoading, isError, refetch } = useCodeBatches();
  const { packages } = usePackages();
  const { methods } = usePaymentMethods();
  const generate = useGenerateCodes();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [creditValue, setCreditValue] = useState(10);
  const [label, setLabel] = useState("");
  const [packageId, setPackageId] = useState<string>(NONE);
  const [paymentMethodId, setPaymentMethodId] = useState<string>(NONE);
  const [justGenerated, setJustGenerated] = useState<{ batchId: string; codes: string[] } | null>(null);

  async function handleGenerate() {
    try {
      const result = await generate.generate({
        count,
        creditValue,
        label,
        packageId: packageId === NONE ? undefined : packageId,
        paymentMethodId: paymentMethodId === NONE ? undefined : paymentMethodId,
      });
      setJustGenerated(result);
      toast.success(t("generated", { count: result.count }));
    } catch {
      // error toast already fired by the hook's onError
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setJustGenerated(null);
    setLabel("");
    setCount(10);
    setCreditValue(10);
    setPackageId(NONE);
    setPaymentMethodId(NONE);
  }

  function downloadJustGenerated() {
    if (!justGenerated) return;
    const csv = buildCsv([t("csv.code")], justGenerated.codes.map((c) => [c]));
    downloadCsv(`codes-${justGenerated.batchId}.csv`, csv);
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>{t("loadError")}</p>
        <Button variant="outline" onClick={refetch}>{t("retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>{t("generateCodes")}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.label")}</TableHead>
            <TableHead>{t("columns.total")}</TableHead>
            <TableHead>{t("columns.used")}</TableHead>
            <TableHead>{t("columns.expired")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          ) : (
            batches.map((batch) => (
              <TableRow
                key={batch.batchId}
                className="cursor-pointer"
                onClick={() => router.push(`/${locale}/admin/codes/${batch.batchId}`)}
              >
                <TableCell>{batch.batchLabel ?? t("noLabel")}</TableCell>
                <TableCell>{batch.total}</TableCell>
                <TableCell>
                  <Badge variant="success">{batch.used}</Badge>
                </TableCell>
                <TableCell>
                  {Number(batch.expired) > 0 ? <Badge variant="destructive">{batch.expired}</Badge> : batch.expired}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={(open) => !generate.isPending && (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("generateCodes")}</DialogTitle>
            <DialogDescription>{t("generateDescription")}</DialogDescription>
          </DialogHeader>

          {justGenerated ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{t("generated", { count: justGenerated.codes.length })}</p>
              <Button variant="outline" onClick={downloadJustGenerated}>{t("downloadCsv")}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="codes-label">{t("form.label")}</Label>
                <Input id="codes-label" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="codes-count">{t("form.count")}</Label>
                <Input id="codes-count" type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="codes-credit-value">{t("form.creditValue")}</Label>
                <Input id="codes-credit-value"
                  type="number"
                  value={creditValue}
                  onChange={(e) => setCreditValue(Number(e.target.value))}
                  disabled={packageId !== NONE}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="codes-package">{t("form.package")}</Label>
                <Select value={packageId} onValueChange={setPackageId}>
                  <SelectTrigger id="codes-package"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("form.noPackage")}</SelectItem>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} ({formatCredits(pkg.credits)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="codes-payment-method">{t("form.paymentMethod")}</Label>
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger id="codes-payment-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("form.noPaymentMethod")}</SelectItem>
                    {methods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>{method.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {generate.error ? <p className="text-sm text-destructive">{generate.error.message}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {justGenerated ? t("close") : t("cancel")}
            </Button>
            {!justGenerated && (
              <Button type="button" disabled={generate.isPending || !label} onClick={() => void handleGenerate()}>
                {t("generateCodes")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
