import { config } from "../config";

/**
 * Shared fetch + parse for New API's own channel-list admin endpoint
 * (`/api/channel`). Extracted out of admin.router.ts's `gatewayChannels`
 * query so model-sync.service.ts can reuse the exact same request and
 * field-parsing logic to derive per-model latency — one source of truth
 * for "what does New API say a channel's response time is", instead of
 * two slightly-different fetches that could drift apart.
 */

export interface GatewayChannel {
  id:           number;
  name:         string;
  type:         string;
  status:       number; // 1 = enabled
  responseTime: number; // ms, 0 = never tested
  models:       string[];
}

export async function fetchGatewayChannels(): Promise<GatewayChannel[]> {
  let res: Response;
  try {
    res = await fetch(`${config.GATEWAY_URL}/api/channel/?p=0&page_size=100`, {
      headers: { Authorization: `Bearer ${config.GATEWAY_ROOT_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(
      `Could not reach gateway channel list: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gateway channel list returned ${res.status}. GATEWAY_ROOT_TOKEN must be a New API ` +
      `admin/system access token. Body: ${body.slice(0, 300)}`
    );
  }

  const body = (await res.json().catch(() => null)) as
    | { data?: { items?: unknown[] } | unknown[] }
    | null;

  const rawItems: unknown[] = Array.isArray(body?.data)
    ? body.data
    : Array.isArray((body?.data as { items?: unknown[] } | undefined)?.items)
    ? (body!.data as { items: unknown[] }).items
    : [];

  return rawItems.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id:           Number(r.id ?? 0),
      name:         String(r.name ?? "unnamed"),
      type:         String(r.type ?? r.type_name ?? "unknown"),
      status:       Number(r.status ?? 0),
      responseTime: Number(r.response_time ?? r.test_time ?? 0),
      models:       typeof r.models === "string" ? (r.models as string).split(",").filter(Boolean) : [],
    };
  });
}

/**
 * model id → average response time (ms) across enabled channels that
 * currently serve it. Only channels with status=1 (enabled) and a real
 * recorded test (responseTime > 0) count — a disabled or never-tested
 * channel shouldn't drag a model's number down to a misleading value.
 */
export function averageResponseTimeByModel(channels: GatewayChannel[]): Map<string, number> {
  const samples = new Map<string, number[]>();
  for (const ch of channels) {
    if (ch.status !== 1 || ch.responseTime <= 0) continue;
    for (const modelId of ch.models) {
      const list = samples.get(modelId) ?? [];
      list.push(ch.responseTime);
      samples.set(modelId, list);
    }
  }
  const averages = new Map<string, number>();
  for (const [modelId, list] of samples) {
    averages.set(modelId, Math.round(list.reduce((a, b) => a + b, 0) / list.length));
  }
  return averages;
}
