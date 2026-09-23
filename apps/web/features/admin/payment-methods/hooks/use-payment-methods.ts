"use client";

import { trpc } from "@/lib/trpc";

export function usePaymentMethods() {
  const query = trpc.admin.listPaymentMethods.useQuery();
  return {
    methods: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
