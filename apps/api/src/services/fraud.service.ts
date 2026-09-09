import { db, fraudEvents, users } from "@ai-platform/db";
import { eq } from "drizzle-orm";
import { FRAUD } from "@ai-platform/config";
import type { FraudCheckResult, FraudEventInput } from "@ai-platform/types";

export class FraudService {
  constructor(private redis: { incr: Function; expire: Function; sadd: Function; scard: Function; incrby: Function }) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Check per-minute and per-hour request rate */
  async checkRequestVelocity(userId: string, ip: string): Promise<FraudCheckResult> {
    const rpmKey = `rate:${userId}:rpm`;
    const count  = await this.redis.incr(rpmKey) as number;
    await this.redis.expire(rpmKey, 60);

    if (count > FRAUD.MAX_REQUESTS_PER_MINUTE) {
      await this.logEvent({ userId, type: "HIGH_REQUEST_VELOCITY", severity: "medium",
        details: { count, ip }, ip });
      return { allowed: false, reason: "RATE_LIMIT_EXCEEDED" };
    }

    // Track unique IPs per user today
    const ipKey = `user:${userId}:ips:${this.today()}`;
    await this.redis.sadd(ipKey, ip);
    await this.redis.expire(ipKey, 86400);
    const ipCount = await this.redis.scard(ipKey) as number;

    if (ipCount > FRAUD.MAX_IPS_PER_USER_PER_DAY) {
      await this.logEvent({ userId, type: "MULTIPLE_IPS", severity: "low",
        details: { ipCount }, ip });
    }

    // Track unique users per IP today
    const userIpKey = `ip:${ip}:users:${this.today()}`;
    await this.redis.sadd(userIpKey, userId);
    await this.redis.expire(userIpKey, 86400);
    const usersFromIp = await this.redis.scard(userIpKey) as number;

    if (usersFromIp > FRAUD.MAX_USERS_PER_IP_PER_DAY) {
      await this.logEvent({ userId, type: "SHARED_IP_MULTI_ACCOUNT", severity: "high",
        details: { ip, usersFromIp }, ip });
    }

    return { allowed: true };
  }

  /** Check redeem attempt rate limits */
  async checkRedeemAttempt(userId: string, ip: string): Promise<FraudCheckResult> {
    const hourKey = `redeem:${userId}:hour`;
    const dayKey  = `redeem:${userId}:day:${this.today()}`;

    const hourCount = await this.redis.incr(hourKey) as number;
    await this.redis.expire(hourKey, 3600);

    if (hourCount > FRAUD.REDEEM_ATTEMPTS_PER_HOUR) {
      await this.logEvent({ userId, type: "REDEEM_BRUTE_FORCE", severity: "high",
        details: { hourCount, ip }, ip });
      return { allowed: false, reason: "TOO_MANY_ATTEMPTS" };
    }

    const dayCount = await this.redis.incr(dayKey) as number;
    await this.redis.expire(dayKey, 86400);

    if (dayCount > FRAUD.REDEEM_ATTEMPTS_PER_DAY) {
      await this.logEvent({ userId, type: "REDEEM_DAILY_LIMIT", severity: "medium",
        details: { dayCount }, ip });
      return { allowed: false, reason: "DAILY_LIMIT_REACHED" };
    }

    return { allowed: true };
  }

  /** Check if spending too fast (post-deduction) */
  async checkSpendVelocity(userId: string, microCredits: number): Promise<void> {
    const key   = `spend:${userId}:hour`;
    const total = await this.redis.incrby(key, microCredits) as number;
    await this.redis.expire(key, 3600);

    const threshold = FRAUD.MAX_CREDITS_PER_HOUR * 1_000_000;
    if (total > threshold) {
      await this.logEvent({ userId, type: "HIGH_SPEND_VELOCITY", severity: "critical",
        details: { hourlySpendMicro: total, thresholdMicro: threshold } });
      await this.alertAdmin(
        `🚨 HIGH SPEND: User ${userId} spent ${(total / 1_000_000).toFixed(0)} credits in 1 hour`
      );
    }
  }

  private async logEvent(event: FraudEventInput): Promise<void> {
    await db.insert(fraudEvents).values({ ...event, createdAt: new Date() });

    // Auto-suspend on critical events
    if (event.severity === "critical") {
      await db.update(users)
        .set({ isFraudFlagged: true, fraudReason: event.type })
        .where(eq(users.id, event.userId ?? ""));
    }
  }

  private async alertAdmin(message: string): Promise<void> {
    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text: message }),
    }).catch(console.error);
  }
}
