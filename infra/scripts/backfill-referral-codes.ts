#!/usr/bin/env tsx
/**
 * Backfill referral_code for existing users.
 *
 * The referral system (decisions.md ADR-009) only generates a user's
 * referral_code inside `databaseHooks.user.create.after` in
 * apps/web/lib/auth.ts — which runs at SIGNUP time. Any account created
 * before that hook was added has `referral_code = NULL` forever, so
 * <ReferralCard> (apps/web/components/settings/ReferralCard.tsx) silently
 * renders nothing for them — no error, just an empty spot in Settings.
 *
 * This script finds every user with a null referral_code and assigns one,
 * using the exact same charset/length/algorithm as the live signup hook
 * so backfilled codes are indistinguishable from ones minted at signup.
 *
 * Safe to re-run: only touches rows where referral_code IS NULL, so
 * running it twice (or after new organic signups happen) is a no-op for
 * anyone who already has a code.
 *
 * Usage (from repo root):
 *   pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/backfill-referral-codes.ts
 *   pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/backfill-referral-codes.ts --dry-run
 *
 * ("pnpm tsx ...") does NOT work here — tsx isn't a root dependency,
 * only packages/db and apps/api have it, so it has to be run from one
 * of those package directories. The GitHub Actions workflow
 * (.github/workflows/backfill-referral-codes.yml) handles this for you
 * if you don't want to run it locally.
 */
import { db, users } from "@ai-platform/db";
import { eq, isNull } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

// Identical to generateReferralCode() in apps/web/lib/auth.ts — same
// charset (no ambiguous 0/O/1/I/L), same length. Keep these in sync if
// either ever changes.
function generateReferralCode(): string {
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => CHARS[b % CHARS.length]).join("");
}

/** Generate a code guaranteed not to collide with an existing row. */
async function uniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const clash = await db.query.users.findFirst({
      where:   eq(users.referralCode, code),
      columns: { id: true },
    });
    if (!clash) return code;
  }
  // 32^8 possibility space — this should be unreachable in practice.
  throw new Error("Could not generate a unique referral code after 5 attempts");
}

async function main() {
  const missing = await db.query.users.findMany({
    where:   isNull(users.referralCode),
    columns: { id: true, email: true },
  });

  if (missing.length === 0) {
    console.log("✅ Every user already has a referral code — nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${missing.length} user(s) without a referral code.`);
  if (DRY_RUN) console.log("(--dry-run: no changes will be written)\n");

  let updated = 0;
  let failed  = 0;

  for (const user of missing) {
    try {
      const code = await uniqueReferralCode();
      if (!DRY_RUN) {
        await db.update(users)
          .set({ referralCode: code })
          .where(eq(users.id, user.id));
      }
      console.log(`  ✓ ${user.email} → ${code}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${user.email} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n${DRY_RUN ? "Would update" : "Updated"} ${updated} user(s).`);
  if (failed > 0) console.log(`${failed} user(s) failed — re-run the script to retry them.`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
