/**
 * apps/web/features/settings/sections/api-access/api-base-url.ts (Phase 7.2)
 *
 * The plan (§6 Phase 7.2) asks for a `NEXT_PUBLIC_API_BASE_URL` constant
 * for the curl docs. The only existing pointer to the Fastify API's
 * public URL is `INTERNAL_API_URL` (app/api/chat/route.ts), which is
 * server-only on purpose and lives in the root `.env.example` — outside
 * `apps/web`, i.e. frozen for this rebuild (§4). Adding the new
 * `NEXT_PUBLIC_*` var to that file is therefore NOT done in this
 * session; flagged in the phase summary and in
 * docs/frontend/BRANCH_AND_CI_NOTES.md as a one-line env addition for
 * whoever manages the root env files / Vercel project settings.
 *
 * Until that var is set, `getPublicApiBaseUrl()` returns null and the
 * API Access card shows a "not configured yet" state instead of a curl
 * example with a broken/placeholder host — same "fail loudly, don't
 * silently default to something wrong" reasoning as the chat proxy's
 * own CONFIG_ERROR branch for a missing INTERNAL_API_URL.
 */
export function getPublicApiBaseUrl(): string | null {
  const v = process.env.NEXT_PUBLIC_API_BASE_URL;
  return v && v.length > 0 ? v : null;
}

export function buildCurlExample(baseUrl: string, apiKeyPrefix: string): string {
  return [
    `curl ${baseUrl}/chat \\`,
    `  -H "Authorization: Bearer ${apiKeyPrefix}..." \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model":"<model-id>","messages":[{"role":"user","content":"Hello"}],"conversationId":"<uuid>"}'`,
  ].join("\n");
}
