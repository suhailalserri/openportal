/**
 * apps/api/src/monitoring/deliver-alert.ts (plan P2.2)
 *
 * queueAlert() goes through BullMQ, i.e. through Redis. When Redis is the thing
 * that is broken, the alert about it would vanish (noted in Session 12). So:
 * try the queue with a short deadline, and if it fails or is too slow, send
 * straight to Telegram. Never throws, never blocks a request path for long.
 *
 * Known edge: if the enqueue merely TIMES OUT and completes later, the message
 * can be delivered twice (once direct, once by the worker). A duplicate alert
 * is acceptable; a lost one is not.
 */
import type { AlertLevel } from "./telegram";

export interface DeliverDeps {
  enqueue: () => Promise<unknown>;
  sendDirect: () => Promise<unknown>;
  timeoutMs?: number;
}

export async function deliverAlert(deps: DeliverDeps): Promise<"queued" | "direct" | "failed"> {
  const timeoutMs = deps.timeoutMs ?? 3_000;
  try {
    await Promise.race([
      deps.enqueue(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("alert enqueue timed out")), timeoutMs)),
    ]);
    return "queued";
  } catch {
    try {
      await deps.sendDirect();
      return "direct";
    } catch {
      return "failed";
    }
  }
}

export type { AlertLevel };
