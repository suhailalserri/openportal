/**
 * Minimal in-memory stand-in for the subset of ioredis's API FraudService
 * actually uses (incr, expire, sadd, scard, incrby). TTLs are recorded but
 * NOT enforced (no fraud test needs real wall-clock expiry) — this fake
 * exists to make fraud-logic tests fast and deterministic, not to test
 * Redis itself. The DB side effects (fraudEvents rows, user flags) that
 * fraud.service.ts triggers still hit the real test Postgres container.
 *
 * B1 addition: `set(key, value, "EX", seconds, "NX")` — the one ioredis
 * call chat-idempotency.service.ts makes. Kept additive (existing
 * incr/expire/sadd/scard/incrby callers and their tests are untouched) so
 * this stays a drop-in FakeRedis for chat-idempotency integration tests
 * that want it, alongside the standalone FakeIdempotencyRedis already used
 * in chat-idempotency.service.test.ts for the narrower unit tests there.
 */
export class FakeRedis {
  private counters = new Map<string, number>();
  private sets = new Map<string, Set<string>>();
  private kvStore = new Map<string, string>();

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async incrby(key: string, amount: number): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + amount;
    this.counters.set(key, next);
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1; // no-op: TTL enforcement isn't exercised by these tests
  }

  async sadd(key: string, member: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    const isNew = !set.has(member);
    set.add(member);
    this.sets.set(key, set);
    return isNew ? 1 : 0;
  }

  async scard(key: string): Promise<number> {
    return this.sets.get(key)?.size ?? 0;
  }

  /**
   * Only the one call shape chat-idempotency.service.ts actually uses is
   * supported: `set(key, value, "EX", seconds, "NX")`. Like `expire`
   * above, the TTL (`seconds`) is accepted but not enforced — no test using
   * this needs real wall-clock expiry, only the NX claim semantics (first
   * call wins, every subsequent call on the same key is a no-op) that
   * `claimUserMessage`'s "first time vs. retry" behavior depends on.
   * Throws on any other flag combination rather than silently
   * misbehaving, so a future caller relying on unsupported semantics
   * (e.g. plain SET with no NX, or XX) fails loudly instead of getting a
   * fake that quietly does the wrong thing.
   */
  async set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null> {
    if (exFlag !== "EX" || nxFlag !== "NX") {
      throw new Error(`FakeRedis.set: unsupported flags (${exFlag}, ${nxFlag}) — only "EX", <seconds>, "NX" is implemented`);
    }
    void seconds; // accepted, not enforced — see doc comment above
    if (this.kvStore.has(key)) return null;
    this.kvStore.set(key, value);
    return "OK";
  }

  reset(): void {
    this.counters.clear();
    this.sets.clear();
    this.kvStore.clear();
  }
}

