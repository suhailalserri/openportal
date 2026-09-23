"use client";

import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

export interface PackageFormValues {
  name: string;
  nameAr: string;
  priceYer: number;
  priceUsdEquivalent: number;
  credits: number; // whole credits — converted to micro-credits server-side
  description?: string;
  descriptionAr?: string;
  sortOrder: number;
}

/**
 * apps/web/features/admin/packages/hooks/use-save-package.ts (Phase 8b)
 *
 * One hook backing both `createPackage` and `updatePackage` — the form
 * component doesn't need to know which procedure it's calling, only
 * whether it was opened with an existing package (edit) or not (create).
 * No delete procedure exists (phase summary point 2), so `setActive`
 * (an `updatePackage` call with only `isActive` set) is this feature's
 * stand-in for remove/restore.
 */
export function useSavePackage() {
  const utils = trpc.useUtils();
  const invalidate = () => utils.admin.listPackages.invalidate();

  const create = trpc.admin.createPackage.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.admin.updatePackage.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  return {
    create: (values: PackageFormValues) => create.mutateAsync(values),
    update: (id: string, values: Partial<PackageFormValues> & { isActive?: boolean }) =>
      update.mutateAsync({ id, ...values }),
    setActive: (id: string, isActive: boolean) => update.mutateAsync({ id, isActive }),
    isPending: create.isPending || update.isPending,
    error: create.error ?? update.error,
  };
}
