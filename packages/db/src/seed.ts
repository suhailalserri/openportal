/**
 * Development seed: creates admin + test users and properly checksummed redeem codes.
 * Run with: pnpm tsx src/seed.ts
 */
import { db, users, balances, redeemCodes, accounts } from "./index";
import { hashPassword } from "better-auth/crypto";
import { createHmac } from "node:crypto";
import { count, notInArray } from "drizzle-orm";
import crypto from "node:crypto";

// ── Code generation (mirrors apps/api/src/services/redeem.service.ts) ──
// Duplicated here so seed.ts has no cross-package dependency on apps/.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_SALT = process.env.CODE_SALT ?? "dev-seed-salt-change-in-prod";

function generateSeedCode(): string {
  const bytes = crypto.randomBytes(12);
  const seg = (start: number) =>
    Array.from(bytes.subarray(start, start + 4))
      .map((b) => CHARS[b % CHARS.length])
      .join("");
  const body = `${seg(0)}-${seg(4)}-${seg(8)}`;
  const checksum = createHmac("sha256", CODE_SALT)
    .update(body)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();
  return `${body}-${checksum}`;
}
// ───────────────────────────────────────────────────────────────────────

// P3.5: the accounts this script creates have PUBLIC, fixed passwords
// (Admin123! / User123!), and the admin is a superadmin. On a database with real
// users that is a backdoor, so refuse unless the only users are these two.
// ALLOW_SEED_ON_NONEMPTY=1 is for a deliberate local override; never set it in
// CI or against production.
const SEEDED_EMAILS = ["admin@localhost.dev", "user@localhost.dev"];

async function assertSafeToSeed(): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(notInArray(users.email, SEEDED_EMAILS));
  const others = Number(row?.n ?? 0);
  if (others > 0 && process.env.ALLOW_SEED_ON_NONEMPTY !== "1") {
    console.error(
      `❌ Refusing to seed: this database has ${others} user(s) other than the seed accounts. ` +
      "Seeding would add a superadmin with a public password. Set ALLOW_SEED_ON_NONEMPTY=1 only for a throwaway local database.",
    );
    process.exit(1);
  }
}

async function seed() {
  await assertSafeToSeed();
  console.log("🌱 Seeding database...");

  // ── Superadmin ────────────────────────────────────────────────────────
  // NOTE: password is stored in `accounts` (providerId: "credential"), not
  // on `users.passwordHash` — that column is legacy and unused by better-auth.
  // Hashed with better-auth's own scrypt-based hashPassword so the seeded
  // account can actually log in through the real auth flow.
  const [admin] = await db
    .insert(users)
    .values({
      email:         "admin@localhost.dev",
      displayName:   "Super Admin",
      role:          "superadmin",
      status:        "active",
      emailVerified: true,
      locale:        "ar",
      tier:          "premium",
      referralCode:  "ADMIN001",
    })
    .returning()
    .onConflictDoNothing();

  if (admin) {
    await db.insert(accounts).values({
      id:         crypto.randomUUID(),
      userId:     admin.id,
      accountId:  admin.id,
      providerId: "credential",
      password:   await hashPassword("Admin123!"),
    }).onConflictDoNothing();

    await db.insert(balances)
      .values({ userId: admin.id, credits: 100_000 * 1_000_000 })
      .onConflictDoNothing();
    console.log("✅ Admin: admin@localhost.dev / Admin123!");
  }

  // ── Test user ─────────────────────────────────────────────────────────
  const [testUser] = await db
    .insert(users)
    .values({
      email:         "user@localhost.dev",
      displayName:   "Test User",
      role:          "user",
      status:        "active",
      emailVerified: true,
      locale:        "ar",
      referralCode:  "TEST001",
    })
    .returning()
    .onConflictDoNothing();

  if (testUser) {
    await db.insert(accounts).values({
      id:         crypto.randomUUID(),
      userId:     testUser.id,
      accountId:  testUser.id,
      providerId: "credential",
      password:   await hashPassword("User123!"),
    }).onConflictDoNothing();

    await db.insert(balances)
      .values({ userId: testUser.id, credits: 100 * 1_000_000 })
      .onConflictDoNothing();
    console.log("✅ Test user: user@localhost.dev / User123!");
  }

  // ── Sample redeem codes (valid checksums) ─────────────────────────────
  const batchId = crypto.randomUUID();
  const seedCodes = Array.from({ length: 5 }, () => ({
    code:         generateSeedCode(),
    creditAmount: 50 * 1_000_000,   // 50 display credits
    faceValue:    "50 رصيد",
    batchId,
    batchLabel:   "seed-batch",
    status:       "unused" as const,
  }));

  await db.insert(redeemCodes).values(seedCodes).onConflictDoNothing();
  console.log("✅ Seed redeem codes:");
  seedCodes.forEach((c) => console.log(`   ${c.code}`));

  if (CODE_SALT === "dev-seed-salt-change-in-prod") {
    console.log(
      "\n⚠️  Using default CODE_SALT. Set CODE_SALT env var to match your .env" +
      " before seeding, otherwise codes won't validate in the app."
    );
  }

  console.log("\n🎉 Seed complete!");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });

// The models seed is in a separate script to avoid circular deps
// Run: pnpm tsx src/seed-models.ts
