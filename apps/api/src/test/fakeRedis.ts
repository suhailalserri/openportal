/**
 * Minimal in-memory stand-in for the subset of ioredis's API FraudService
 * actually uses (incr, expire, sadd, scard, incrby). TTLs are recorded but
 * NOT enforced (no fraud test needs real wall-clock expiry) — this fake
 * exists to make fraud-logic tests fast and deterministic, not to test
 * Redis itself. The DB side effects (fraudEvents rows, user flags) that
 * fraud.service.ts triggers still hit the real test Postgres container.
 */
export class FakeRedis {
  private counters = new Map<string, number>();
  private sets = new Map<string, Set<string>>();

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

  reset(): void {
    this.counters.clear();
    this.sets.clear();
  }
}
