import {
  db, users, balances, platformConfig, PLATFORM_CONFIG_ID,
} from "@ai-platform/db";
import { and, count, eq, gte, isNull, isNotNull } from "drizzle-orm";
import { creditBalance } from "./balance.service";

type Executor = typeof db;

/**
 * Welcome bonus for new users (decisions.md ADR-010).
 *
 * A one-time credit grant an admin can switch on/off and size from
 * /admin/welcome-bonus. A new user claims it from the floating card shown
 * after the passkey offer, or later from the billing page.
 *
 * ── Why it can only ever be claimed once ─────────────────────────────
 * The claim is a single conditional UPDATE on the user's own row:
 *
 *     UPDATE users SET welcome_bonus_claimed_at = now()
 *     WHERE id = $1 AND welcome_bonus_claimed_at IS NULL AND <eligible>
 *     RETURNING id
 *
 * It runs in the SAME transaction as the credit + ledger row, so either
 * both happen or neither does. Postgres serialises concurrent UPDATEs of
 * one row: the second caller waits for the first to commit, re-checks the
 * WHERE clause, no longer matches, and gets zero rows back. A double
 * click, two tabs, two devices or a retry after a network blip therefore
 * cannot pay out twice. Same pattern as referral.service.ts's
 * `referralBonusAwardedAt` and redeemCode()'s status flip.
 *
 * ── Who counts as a "new user" ───────────────────────────────────────
 * Only accounts created at/after `platform_config.welcome_bonus_launched_at`
 * — stamped once, the first time an admin enables the bonus, and never
 * reset by later off/on toggles. That keeps "enable the feature" from
 * handing credit to every account that already existed, while a user who
 * registered during a temporary "off" period still gets it once it's back
 * on. The user must also be `active` (verified) and not fraud-flagged —
 * throwaway/unverified accounts are the obvious farming vector.
 */

export type WelcomeBonusErrorCode =
  | "DISABLED"
  | "ALREADY_CLAIMED"
  | "NOT_ELIGIBLE"
  | "ACCOUNT_RESTRICTED";

export class WelcomeBonusError extends Error {
  constructor(public readonly code: WelcomeBonusErrorCode, message: string) {
    super(message);
    this.name = "WelcomeBonusError";
  }
}

export interface WelcomeBonusConfig {
  enabled:            boolean;
  amountMicroCredits: number;
  launchedAt:         Date | null;
}

export interface WelcomeBonusUserFacts {
  status:                "active" | "suspended" | "pending_verification";
  isFraudFlagged:        boolean;
  createdAt:             Date;
  welcomeBonusClaimedAt: Date | null;
}

/** True when the feature is on AND actually pays something. */
export function isBonusActive(config: WelcomeBonusConfig): boolean {
  return config.enabled && config.amountMicroCredits > 0;
}

/**
 * Pure eligibility decision (no I/O) so every branch is unit-testable.
 * Returns null when the user may claim, else the reason they can't.
 * Order matters: "already claimed" is reported before "not eligible" so a
 * user who has claimed sees the truthful state, not a confusing one.
 */
export function ineligibilityReason(
  config: WelcomeBonusConfig,
  user:   WelcomeBonusUserFacts,
): WelcomeBonusErrorCode | null {
  if (!isBonusActive(config))        return "DISABLED";
  if (user.welcomeBonusClaimedAt)    return "ALREADY_CLAIMED";
  if (user.status !== "active" || user.isFraudFlagged) return "ACCOUNT_RESTRICTED";
  if (!config.launchedAt || user.createdAt.getTime() < config.launchedAt.getTime()) {
    return "NOT_ELIGIBLE";
  }
  return null;
}

async function readConfig(executor: Executor): Promise<WelcomeBonusConfig> {
  const row = await executor.query.platformConfig.findFirst({
    where: eq(platformConfig.id, PLATFORM_CONFIG_ID),
  });
  return {
    enabled:            row?.welcomeBonusEnabled ?? false,
    amountMicroCredits: row?.welcomeBonusMicroCredits ?? 0,
    launchedAt:         row?.welcomeBonusLaunchedAt ?? null,
  };
}

export interface WelcomeBonusStatus {
  /** Feature on and paying > 0 — false hides every claim surface. */
  enabled:            boolean;
  amountMicroCredits: number;
  claimed:            boolean;
  /** Can claim right now. The only flag the UI needs to show a claim button. */
  eligible:           boolean;
}

/** What the current user sees. Never exposes launch dates or admin fields. */
export async function getWelcomeBonusStatus(
  userId: string,
  executor: Executor = db,
): Promise<WelcomeBonusStatus> {
  const [config, user] = await Promise.all([
    readConfig(executor),
    executor.query.users.findFirst({
      where:   eq(users.id, userId),
      columns: { status: true, isFraudFlagged: true, createdAt: true, welcomeBonusClaimedAt: true },
    }),
  ]);

  if (!user) {
    return { enabled: false, amountMicroCredits: 0, claimed: false, eligible: false };
  }

  const reason = ineligibilityReason(config, user);
  return {
    enabled:            isBonusActive(config),
    amountMicroCredits: isBonusActive(config) ? config.amountMicroCredits : 0,
    claimed:            user.welcomeBonusClaimedAt !== null,
    eligible:           reason === null,
  };
}

export interface ClaimResult {
  amountMicroCredits: number;
  newBalance:         number;
}

/**
 * Claim the welcome bonus. Exactly-once, race-safe — see the header.
 * Throws WelcomeBonusError with a stable `code` the router maps to a
 * translated message; never partially applies (single transaction).
 */
export async function claimWelcomeBonus(
  userId: string,
  executor: Executor = db,
): Promise<ClaimResult> {
  return executor.transaction(async (tx) => {
    const config = await readConfig(tx as unknown as Executor);
    const user = await tx.query.users.findFirst({
      where:   eq(users.id, userId),
      columns: { status: true, isFraudFlagged: true, createdAt: true, welcomeBonusClaimedAt: true },
    });
    if (!user) throw new WelcomeBonusError("NOT_ELIGIBLE", "User not found");

    // Friendly, specific errors first…
    const reason = ineligibilityReason(config, user);
    if (reason) throw new WelcomeBonusError(reason, `Welcome bonus unavailable: ${reason}`);

    // …then the real guard. Every eligibility condition is repeated in the
    // WHERE so a concurrent claim / suspension / flag between the read
    // above and this write can't slip through; only the winner gets a row.
    const claimed = await tx
      .update(users)
      .set({ welcomeBonusClaimedAt: new Date() })
      .where(and(
        eq(users.id, userId),
        isNull(users.welcomeBonusClaimedAt),
        eq(users.status, "active"),
        eq(users.isFraudFlagged, false),
        gte(users.createdAt, config.launchedAt!),
      ))
      .returning({ id: users.id });

    if (claimed.length === 0) {
      throw new WelcomeBonusError("ALREADY_CLAIMED", "Welcome bonus already claimed");
    }

    // A balances row normally exists from signup; make sure, so a missing
    // row can't roll the whole claim back for a legitimate user.
    await tx.insert(balances).values({ userId, credits: 0 }).onConflictDoNothing();

    await creditBalance(
      userId,
      config.amountMicroCredits,
      "welcome_bonus",
      { description: "مكافأة ترحيب للمستخدمين الجدد" },
      tx as unknown as Executor,
    );

    const bal = await tx.query.balances.findFirst({
      where:   eq(balances.userId, userId),
      columns: { credits: true },
    });

    return {
      amountMicroCredits: config.amountMicroCredits,
      newBalance:         bal?.credits ?? config.amountMicroCredits,
    };
  });
}

// ── Admin side ─────────────────────────────────────────────────────────

export interface WelcomeBonusAdminView {
  enabled:            boolean;
  amountMicroCredits: number;
  launchedAt:         Date | null;
  /** How many users have claimed so far — lets the admin see the cost. */
  claimedCount:       number;
}

export async function getWelcomeBonusAdminView(
  executor: Executor = db,
): Promise<WelcomeBonusAdminView> {
  const config = await readConfig(executor);
  const [row] = await executor
    .select({ n: count() })
    .from(users)
    .where(isNotNull(users.welcomeBonusClaimedAt));

  return {
    enabled:            config.enabled,
    amountMicroCredits: config.amountMicroCredits,
    launchedAt:         config.launchedAt,
    claimedCount:       Number(row?.n ?? 0),
  };
}

export interface UpdateWelcomeBonusInput {
  enabled:            boolean;
  amountMicroCredits: number;
  adminId:            string;
}

/**
 * Save the admin toggle + amount. Enabling with a non-positive amount is
 * rejected (an "on" bonus that pays nothing would just confuse users).
 * Stamps `welcome_bonus_launched_at` the first time it's enabled and never
 * changes it afterwards. Returns before/after for the audit log.
 */
export async function updateWelcomeBonusConfig(
  input: UpdateWelcomeBonusInput,
  executor: Executor = db,
): Promise<{ before: WelcomeBonusConfig; after: WelcomeBonusConfig }> {
  if (!Number.isInteger(input.amountMicroCredits) || input.amountMicroCredits < 0) {
    throw new Error("amountMicroCredits must be a non-negative integer");
  }
  if (input.enabled && input.amountMicroCredits <= 0) {
    throw new Error("Set an amount greater than 0 before enabling the welcome bonus");
  }

  return executor.transaction(async (tx) => {
    const before = await readConfig(tx as unknown as Executor);
    const now = new Date();
    const launchedAt = before.launchedAt ?? (input.enabled ? now : null);

    await tx
      .insert(platformConfig)
      .values({
        id:                       PLATFORM_CONFIG_ID,
        welcomeBonusEnabled:      input.enabled,
        welcomeBonusMicroCredits: input.amountMicroCredits,
        welcomeBonusLaunchedAt:   launchedAt,
        updatedByAdminId:         input.adminId,
      })
      .onConflictDoUpdate({
        target: platformConfig.id,
        set: {
          welcomeBonusEnabled:      input.enabled,
          welcomeBonusMicroCredits: input.amountMicroCredits,
          welcomeBonusLaunchedAt:   launchedAt,
          updatedAt:                now,
          updatedByAdminId:         input.adminId,
        },
      });

    return {
      before,
      after: { enabled: input.enabled, amountMicroCredits: input.amountMicroCredits, launchedAt },
    };
  });
}
