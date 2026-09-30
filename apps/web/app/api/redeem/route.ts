import { rejectUnusableAccount } from "@/lib/account-guard-server";
import { NextRequest, NextResponse } from "next/server";
import { auth }       from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { redeemCode } from "@/lib/redeem";
import { z }          from "zod";
import { checkLimit } from "@ai-platform/api/utils/rate-limiter";
import { FRAUD }      from "@ai-platform/config";
import { verifyTurnstileToken, getClientIp } from "@/lib/turnstile-server";

const schema = z.object({
  code:           z.string().min(1).max(32),
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  const body   = await req.json() as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Per-user throttling — these FRAUD thresholds already existed
  // (packages/config/src/constants.ts) and the redeem error copy already
  // anticipated them (TOO_MANY_ATTEMPTS / DAILY_LIMIT_REACHED in
  // messages/*.json), but nothing enforced them until now.
  const ip = getClientIp(reqHeaders);
  const userKey = `redeem:${session.user.id}`;
  if (!checkLimit(`${userKey}:hour`, FRAUD.REDEEM_ATTEMPTS_PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({
      success: false, error: "TOO_MANY_ATTEMPTS",
      message: "تجاوزت عدد المحاولات المسموحة. حاول بعد ساعة.",
    });
  }
  if (!checkLimit(`${userKey}:day`, FRAUD.REDEEM_ATTEMPTS_PER_DAY, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({
      success: false, error: "DAILY_LIMIT_REACHED",
      message: "وصلت إلى الحد اليومي للمحاولات. حاول غداً.",
    });
  }

  const captcha = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
  if (!captcha.success) {
    return NextResponse.json({
      success: false, error: "CAPTCHA_FAILED",
      message: "فشل التحقق الأمني. حاول مرة أخرى.",
    });
  }

  // redeemCode() itself now runs the Redis-backed FraudService.checkRedeemAttempt
  // check (see redeem.service.ts) — this in-memory checkLimit above stays as a
  // cheap, zero-latency first pass (and still works if Redis is briefly down),
  // but it's no longer the only line of defense, and unlike this per-process
  // counter, the Redis-backed check also catches brute-force spread across
  // multiple web/api container replicas.
  const result = await redeemCode(session.user.id, parsed.data.code, ip ?? "unknown");
  return NextResponse.json(result);
}
