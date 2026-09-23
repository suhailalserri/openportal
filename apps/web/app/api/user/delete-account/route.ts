import { NextRequest, NextResponse } from "next/server";
import { auth }        from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { z }            from "zod";
import { checkLimit }   from "@ai-platform/api/utils/rate-limiter";
import { FRAUD }        from "@ai-platform/config";
import { db, users, accounts, sessions, twoFactor } from "@ai-platform/db";
import { eq }            from "drizzle-orm";
import { APIError }      from "better-auth/api";

/**
 * Self-service "Delete Account" from Settings → Danger zone.
 *
 * This deliberately does NOT use better-auth's built-in `user.deleteUser`
 * feature (a hard row delete). `transactions.userId` has no
 * ON DELETE CASCADE/SET NULL (see packages/db/src/schema/transactions.ts) —
 * on purpose, so a user's paid/billed history always resolves to a real
 * row for accounting — so an actual `DELETE FROM users` would just fail
 * with a foreign-key violation for any account that has ever bought
 * credits or sent a chat message, i.e. almost every real account.
 *
 * Instead this anonymizes the user in place: scrubs personally-identifying
 * fields, disables sign-in by removing their credential/OAuth accounts and
 * revoking all sessions, and leaves `balances`/`transactions`/
 * `conversations` rows untouched (conversations already have their own
 * soft-delete column, per that schema's comment about billing records).
 *
 * Identity check before doing any of this:
 *  - Password-auth accounts: verified via better-auth's own
 *    `auth.api.verifyPassword` (the documented, correct primitive for
 *    this — see the comment on the old tRPC `changePassword` mutation in
 *    apps/api/src/routers/user.router.ts for what goes wrong when this
 *    gets hand-rolled against the wrong column instead).
 *  - OAuth-only accounts (no `accounts` row with providerId "credential"):
 *    there's no password to check, so the client instead requires typing
 *    a literal confirmation phrase; enforced here by requiring the
 *    `confirmed` flag rather than trusting the client silently.
 *
 * Phase 7.2 addition — 2FA gate (additive, backward-compatible, same
 * shape as B1's "all new fields optional"): if the account has 2FA
 * enabled (`users.twoFactorEnabled`), deletion also requires a valid
 * TOTP or backup code in `twoFactorCode`, checked via better-auth's own
 * `auth.api.verifyTOTP` / `auth.api.verifyBackupCode` — the same
 * server-side primitives `two-factor-section.tsx` already drives
 * client-side through `authClient.twoFactor.*`, never a hand-rolled
 * check against `twoFactor.secret`. This closes the gap the plan
 * calls for (§6 Phase 7.2: "delete account (password confirm; 2FA code
 * if enabled)") — the route previously only checked password/confirm.
 * A non-2FA account's flow is completely unchanged.
 *
 * NOT VERIFIED: `verifyTOTP`/`verifyBackupCode` are the plugin's
 * documented server-side method names (mirroring the client calls
 * already used in this codebase), but this sandbox has no network/
 * node_modules to import better-auth and confirm the exact export
 * names or error shape against the installed version. Confirm on the
 * first real preview run; if the method name differs, this is a
 * one-line fix.
 */

const schema = z.object({
  password:      z.string().optional(),
  confirmed:     z.boolean().optional(),
  twoFactorCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => ({})) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (!checkLimit(`delete-account:${session.user.id}`, FRAUD.SENSITIVE_ACTION_PER_HOUR, 60 * 60_000)) {
    return NextResponse.json(
      { error: "TOO_MANY_ATTEMPTS", message: "محاولات كثيرة جداً. حاول مرة أخرى لاحقاً." },
      { status: 429 }
    );
  }

  const passwordAccount = await db.query.accounts.findFirst({
    where: (a, { and, eq }) => and(eq(a.userId, session.user.id), eq(a.providerId, "credential")),
  });

  if (passwordAccount) {
    if (!parsed.data.password) {
      return NextResponse.json({ error: "PASSWORD_REQUIRED" }, { status: 400 });
    }
    try {
      await auth.api.verifyPassword({
        body:    { password: parsed.data.password },
        headers: reqHeaders,
      });
    } catch (err) {
      if (err instanceof APIError) {
        return NextResponse.json({ error: "INCORRECT_PASSWORD" }, { status: 400 });
      }
      throw err;
    }
  } else if (!parsed.data.confirmed) {
    // OAuth-only account: no password to verify against. The client is
    // expected to have made the user type a literal confirmation phrase
    // before setting `confirmed: true` — see the Settings page.
    return NextResponse.json({ error: "CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  // Queried directly from `users` (like `passwordAccount` above) rather
  // than trusted off `session.user.twoFactorEnabled` — better-auth's
  // session payload isn't guaranteed to carry every custom user column,
  // and a stale/absent field here must never accidentally SKIP the 2FA
  // check for an account that actually has it enabled.
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { twoFactorEnabled: true },
  });

  if (dbUser?.twoFactorEnabled) {
    if (!parsed.data.twoFactorCode) {
      return NextResponse.json({ error: "TWO_FACTOR_REQUIRED" }, { status: 400 });
    }
    const code = parsed.data.twoFactorCode;
    let verified = false;
    try {
      await auth.api.verifyTOTP({ body: { code }, headers: reqHeaders });
      verified = true;
    } catch (err) {
      if (!(err instanceof APIError)) throw err;
    }
    if (!verified) {
      try {
        await auth.api.verifyBackupCode({ body: { code }, headers: reqHeaders });
        verified = true;
      } catch (err) {
        if (!(err instanceof APIError)) throw err;
      }
    }
    if (!verified) {
      return NextResponse.json({ error: "INVALID_TWO_FACTOR_CODE" }, { status: 400 });
    }
  }

  const anonymizedEmail = `deleted-${session.user.id}@deleted.invalid`;

  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({
        email:            anonymizedEmail,
        displayName:      null,
        avatarUrl:        null,
        passwordHash:     null,
        apiKeyHash:       null,
        apiKeyPrefix:     null,
        twoFactorEnabled: false,
        status:           "suspended",
        updatedAt:        new Date(),
      })
      .where(eq(users.id, session.user.id));

    // Remove every way this account could authenticate again (credential
    // password, linked OAuth accounts), any 2FA enrollment, and kill every
    // existing session.
    await tx.delete(accounts).where(eq(accounts.userId, session.user.id));
    await tx.delete(twoFactor).where(eq(twoFactor.userId, session.user.id));
    await tx.delete(sessions).where(eq(sessions.userId, session.user.id));
  });

  return NextResponse.json({ success: true });
}
