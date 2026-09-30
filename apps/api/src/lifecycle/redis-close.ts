/**
 * apps/api/src/lifecycle/redis-close.ts (plan P3.2)
 *
 * Closes an ioredis client without ever hanging or throwing.
 *  - never connected (lazyConnect, status "wait") or already closed: disconnect()
 *    only (QUIT on a client that never connected can wait forever).
 *  - connected: QUIT (flushes pending replies), bounded; falls back to disconnect().
 */
export interface ClosableRedis {
  status: string;
  quit(): Promise<unknown>;
  disconnect(): void;
}

export async function closeRedisClient(client: ClosableRedis, timeoutMs = 2_000): Promise<void> {
  try {
    if (client.status === "wait" || client.status === "end" || client.status === "close") {
      client.disconnect();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const outcome = await Promise.race([client.quit().then(() => "quit" as const), timedOut]);
    if (timer) clearTimeout(timer);
    if (outcome === "timeout") client.disconnect();
  } catch {
    try { client.disconnect(); } catch { /* already gone */ }
  }
}
