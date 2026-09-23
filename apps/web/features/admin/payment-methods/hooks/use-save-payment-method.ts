"use client";

import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

export interface PaymentMethodFormValues {
  name: string;
  nameAr: string;
  type: "jaib_voucher" | "manual_transfer";
  logoUrl?: string;
  accountCode?: string;
  instructions?: string;
  instructionsAr?: string;
  sortOrder: number;
}

/**
 * apps/web/features/admin/payment-methods/hooks/use-save-payment-
 * method.ts (Phase 8b)
 *
 * Same create/update split as `use-save-package.ts`. `type` is only
 * sent on create — `updatePaymentMethod`'s input schema (admin.router.ts)
 * has no `type` field, so an edit can't change it; the form disables
 * that field when editing rather than silently dropping the value.
 */
export function useSavePaymentMethod() {
  const utils = trpc.useUtils();
  const invalidate = () => utils.admin.listPaymentMethods.invalidate();

  const create = trpc.admin.createPaymentMethod.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.admin.updatePaymentMethod.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  return {
    create: (values: PaymentMethodFormValues) => create.mutateAsync(values),
    update: (id: string, values: Partial<Omit<PaymentMethodFormValues, "type">> & { isActive?: boolean }) =>
      update.mutateAsync({ id, ...values }),
    setActive: (id: string, isActive: boolean) => update.mutateAsync({ id, isActive }),
    isPending: create.isPending || update.isPending,
    error: create.error ?? update.error,
  };
}
