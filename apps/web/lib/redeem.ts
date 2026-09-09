/**
 * Client-side redeem proxy — calls the API route which calls the service.
 * Actual implementation is in apps/api/src/services/redeem.service.ts
 */
export async function redeemCode(
  userId: string,
  code:   string
): Promise<{ success: boolean; message: string; error?: string; creditsAdded?: number }> {
  // This runs server-side in the API route — import the actual service
  const { redeemCode: serviceRedeem } = await import(
    "../../../apps/api/src/services/redeem.service"
  );
  return serviceRedeem(userId, code);
}
