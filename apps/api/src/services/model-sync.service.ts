import { config } from "../config";
import { db, models } from "@ai-platform/db";
import { eq, inArray } from "drizzle-orm";

/**
 * Discovers models the gateway can currently serve and reconciles them
 * against our `models` table. This is a DISCOVERY step, not a publish
 * step: a newly-discovered model is inserted as status="pending" with
 * isAvailable=false and zeroed pricing, so it can never be shown to users
 * or billed for until an admin explicitly reviews and publishes it (see
 * models.router.ts `publish`). Automatic publishing would let a model
 * with no price and no rate limit go live the moment a channel exposes
 * it — a real cost risk, not just a UX nuisance.
 *
 * We hit New API's OpenAI-compatible `/v1/models` with the gateway master
 * key rather than New API's proprietary admin/channel API, because that
 * endpoint is stable, requires no session/cookie auth, and is exactly the
 * set of model strings gateway.service.ts is actually able to route to
 * `/v1/chat/completions` — which is the thing that was silently mismatched
 * (frontend showing "gpt-4o" while the only real channel serves free
 * OpenRouter model strings) and the direct cause of chat requests failing.
 */

interface GatewayModelListResponse {
  data?: Array<{ id?: string }>;
}

export interface ModelSyncResult {
  totalSeenOnGateway: number;
  discovered:  string[]; // new ids inserted as status="pending"
  deactivated: string[]; // previously-available ids no longer served by any channel
  stillPending: number;  // pending rows awaiting admin review, post-sync
}

export async function syncModelsFromGateway(adminUserId: string): Promise<ModelSyncResult> {
  let res: Response;
  try {
    res = await fetch(`${config.GATEWAY_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${config.GATEWAY_MASTER_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(
      `Could not reach gateway at ${config.GATEWAY_URL}/v1/models: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gateway /v1/models returned ${res.status}. Check GATEWAY_MASTER_KEY is a valid ` +
      `New API token and that at least one channel is enabled. Body: ${body.slice(0, 300)}`
    );
  }

  const parsed = (await res.json()) as GatewayModelListResponse;
  const gatewayIds = (parsed.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (gatewayIds.length === 0) {
    // Don't silently "succeed" with zero models — that would look like a
    // real sync that happens to find nothing, when it's much more likely
    // every channel is disabled/misconfigured on the gateway side.
    throw new Error(
      "Gateway returned zero models. Check that your New API channel(s) are " +
      "enabled and have models assigned (see the Channels tab on the gateway)."
    );
  }

  const existing = await db.query.models.findMany();
  const existingById = new Map(existing.map((m) => [m.id, m]));
  const now = new Date();

  const discovered: string[] = [];
  for (const id of gatewayIds) {
    if (existingById.has(id)) continue;
    discovered.push(id);
    await db
      .insert(models)
      .values({
        id,
        displayName:   id,
        displayNameAr: id,
        provider:      id.split("/")[0] || "unknown",
        tier:          "standard",
        status:        "pending",
        isAvailable:   false,
        markupMultiplier: "2.0",
        wholesaleCostInputPerM:  "0",
        wholesaleCostOutputPerM: "0",
        // Placeholders — admin sets real context/output limits when publishing.
        contextWindow:    8_192,
        maxOutputTokens:  2_048,
        supportsVision:   false,
        lastSeenAt: now,
      })
      .onConflictDoNothing();
  }

  // A model that's live (published + available) but the gateway no longer
  // serves it (channel removed/model unassigned) gets hidden — status is
  // left alone so re-adding the channel later can bring it straight back
  // via a re-sync + a quick re-publish, instead of losing the admin's
  // pricing/config work.
  const gone = existing.filter(
    (m) => m.status === "published" && m.isAvailable && !gatewayIds.includes(m.id)
  );
  if (gone.length > 0) {
    await db
      .update(models)
      .set({ isAvailable: false, updatedAt: now, updatedByAdminId: adminUserId })
      .where(inArray(models.id, gone.map((m) => m.id)));
  }

  const stillPresentIds = gatewayIds.filter((id) => existingById.has(id));
  if (stillPresentIds.length > 0) {
    await db.update(models).set({ lastSeenAt: now }).where(inArray(models.id, stillPresentIds));
  }

  const pendingCount = existing.filter((m) => m.status === "pending").length + discovered.length;

  return {
    totalSeenOnGateway: gatewayIds.length,
    discovered,
    deactivated: gone.map((m) => m.id),
    stillPending: pendingCount,
  };
}
