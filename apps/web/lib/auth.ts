import { betterAuth }      from "better-auth";
import { drizzleAdapter }  from "better-auth/adapters/drizzle";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { twoFactor }       from "better-auth/plugins";
import { passkey }          from "@better-auth/passkey";
import { db }              from "@ai-platform/db";
import {
  users, sessions, accounts, verifications, balances,
  twoFactor as twoFactorTable,
  passkeys as passkeyTable,
  rateLimits as rateLimitTable,
} from "@ai-platform/db";
import { eq }               from "drizzle-orm";
import { verifyTurnstileToken, getClientIp } from "./turnstile-server";

// Credits new users start with, in micro-credits (1 credit = 1,000,000
// micro-credits — see packages/config/src/constants.ts MICRO_CREDIT).
// Set to 0 if you don't want a free trial balance, but the row still
// needs to exist — creditBalance() does a plain UPDATE and throws
// "Balance row not found" if there's nothing to update.
const SIGNUP_BONUS_MICRO_CREDITS = 0;

/**
 * Every user's own shareable code (decisions.md ADR-009). Short and
 * human-typeable, same charset as the redeem-code / manual-transfer
 * reference-code generators in apps/api (no ambiguous 0/O/1/I/L) — this
 * is an identifier, not a bearer credential, so no checksum is needed.
 */
function generateReferralCode(): string {
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => CHARS[b % CHARS.length]).join("");
}

// Same expression the `baseURL` option used inline before; hoisted so the
// passkey plugin below derives its relying-party id / origin from it too.
const appBaseUrl = (
  process.env.BETTER_AUTH_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
).replace(/\/$/, "");

// Passkeys are cryptographically bound to this domain (the WebAuthn "RP ID").
// A passkey registered on one domain never works on another, and moving to a
// new domain later orphans every registered passkey — set PASSKEY_RP_ID (or
// BETTER_AUTH_URL) to the production domain you intend to keep. Per-deployment
// Vercel preview URLs can't use passkeys for the same reason.
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost"; // a malformed BETTER_AUTH_URL must not crash module load
  }
}
const passkeyRpId = process.env.PASSKEY_RP_ID || hostnameOf(appBaseUrl);

/**
 * Google sign-in is optional: with no client id/secret the provider simply
 * isn't registered (CI, e2e and local runs keep working untouched).
 */
const googleClientId     = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Google signups can't send the `x-referral-code` header the email flow uses
 * (the account is created in the OAuth callback — a plain browser redirect
 * back from Google, with no custom headers). The register page instead
 * drops the code into a short-lived `ref_code` cookie just before the
 * redirect to Google (see components/auth/google-sign-in.tsx), and it comes
 * back on the callback request. Validated to the referral-code alphabet and
 * length so a tampered cookie can't inject anything.
 */
function readReferralCookie(headers: Headers | null | undefined): string | null {
  const raw = headers?.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== "ref_code") continue;
    try {
      const value = decodeURIComponent(rest.join("=")).trim().toUpperCase();
      return /^[A-Z0-9]{4,12}$/.test(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

// A referral may only be attributed to an account created moments ago —
// otherwise an existing user could "adopt" a referrer just by logging in
// through a ?ref= link.
const REFERRAL_WINDOW_MS = 10 * 60 * 1000;

/**
 * Idempotent per-user setup, run every time a session is created.
 *
 * Why it exists: everything that used to happen at signup assumed the
 * email/password flow — `users.status` was flipped to "active" by
 * `emailVerification.afterEmailVerification`, and the balances row +
 * referral code were written from `databaseHooks.user.create.after`. A
 * Google account never triggers the email-verification hook (Google already
 * verified the address), so without this its status would stay
 * "pending_verification" and chat would answer 403. And for social logins
 * `user.create.after` can run before the user row is visible (the
 * better-auth#7260 timing issue noted below), so the balances row and
 * referral code may be missing.
 *
 * Safe to run repeatedly, never throws (a failure must not block a login),
 * and only ever activates a "pending_verification" user whose email is
 * verified — a suspended user is left suspended.
 */
async function ensureUserSetup(userId: string, headers?: Headers | null): Promise<void> {
  try {
    await db.insert(balances)
      .values({ userId, credits: SIGNUP_BONUS_MICRO_CREDITS })
      .onConflictDoNothing();

    const row = await db.query.users.findFirst({
      where:   eq(users.id, userId),
      columns: {
        status: true, emailVerified: true, referralCode: true,
        referredByUserId: true, createdAt: true,
      },
    });
    if (!row) return;

    const patch: { status?: "active"; referralCode?: string; referredByUserId?: string } = {};
    if (row.status === "pending_verification" && row.emailVerified) {
      patch.status = "active";
    }
    if (!row.referralCode) patch.referralCode = generateReferralCode();

    // Referral attribution for social signups (see readReferralCookie).
    if (!row.referredByUserId && row.createdAt.getTime() > Date.now() - REFERRAL_WINDOW_MS) {
      const refCode = readReferralCookie(headers);
      if (refCode) {
        const referrer = await db.query.users.findFirst({
          where:   eq(users.referralCode, refCode),
          columns: { id: true },
        });
        if (referrer && referrer.id !== userId) patch.referredByUserId = referrer.id;
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, userId));
    }
  } catch (err) {
    console.error("ensureUserSetup failed (login still succeeds):", err);
  }
}

export const auth = betterAuth({
  // Used as the default TOTP issuer name shown in authenticator apps
  // (Google Authenticator, Authy, etc.) for the twoFactor plugin below.
  appName: "OpenPortal",

  // better-auth uses this to build every outgoing link it generates itself
  // (email verification, password reset, etc). It reads BETTER_AUTH_URL
  // internally if you don't set this, but that's opt-in and silent — if the
  // env var is ever missing on a deployment, links quietly fall back to
  // http://localhost:3000 instead of failing loudly. Setting it explicitly,
  // with the same VERCEL_URL fallback used below in trustedOrigins, means a
  // missing env var degrades to *this* deployment's real URL instead.
  baseURL: appBaseUrl,

  database: drizzleAdapter(db, {
    provider: "pg",
    // Keys must be better-auth's canonical model names (user/session/account/
    // verification), not your table variable names — this was previously
    // `{ users, sessions }`, missing account/verification entirely and using
    // the wrong keys. Without `account`, better-auth has nowhere to write a
    // password on signup; without `verification`, email-verification tokens
    // have nowhere to live.
    schema: {
      user:         users,
      session:      sessions,
      account:      accounts,
      verification: verifications,
      // Model name is the twoFactor plugin's own canonical name — must
      // match exactly, same rule as user/session/account/verification
      // above. See packages/db/src/schema/two-factor.ts for the table.
      twoFactor:    twoFactorTable,
      // Passkey plugin's canonical model name; table in
      // packages/db/src/schema/passkey.ts (migration 0011_passkey.sql).
      passkey:      passkeyTable,
      // Rate-limit counters (rateLimit.storage: "database" below). Model name is
      // better-auth's own `rateLimit`. Table in packages/db/src/schema/rate-limit.ts
      // (migration 0019_auth_rate_limit.sql).
      rateLimit:    rateLimitTable,
    },
  }),

  emailAndPassword: {
    enabled:                  true,
    requireEmailVerification: true,
    minPasswordLength:        8,
    // No `validatePassword` option exists on this pinned better-auth
    // version's emailAndPassword config (confirmed by the build's own
    // reported type) — the uppercase/digit strength rules are enforced
    // in the `hooks.before` middleware below instead, in the same place
    // that already gates sign-up behind Turnstile.
  },

  // Google sign-in. Redirect URI to register in Google Cloud Console:
  //   {BETTER_AUTH_URL}/api/auth/callback/google
  // Google needs EXACT redirect URIs, so it only works on the production
  // domain (and localhost), never on per-deployment Vercel preview URLs.
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},

  session: {
    expiresIn:   60 * 60 * 24 * 7,  // 7 days
    updateAge:   60 * 60 * 24,      // Refresh after 1 day of use
    // P1.1 follow-up (owner-approved frozen-zone edit): cache OFF. With a
    // 5-minute cookie cache, deleting a suspended user's session row (which
    // updateUserStatus, fraud.service and the 0018 trigger all do) did not
    // take effect on the app/api/** routes for up to 5 minutes, because
    // getSession trusted the signed cookie without touching the DB. Cost: one
    // session lookup per getSession call. If P4.2's load test shows that read
    // hurting, restore a SHORT maxAge (e.g. 30 s) rather than the old 5 min.
    cookieCache: { enabled: false },
    // Your `sessions` table uses `ip` instead of better-auth's canonical
    // `ipAddress` — map it so better-auth writes to the right column.
    fields: {
      ipAddress: "ip",
    },
  },

  // better-auth's default ID generator produces a nanoid-style string, not a
  // real UUID. `users.id` is a Postgres `uuid` column (defaultRandom()), so
  // that default generator fails on signup with:
  //   invalid input syntax for type uuid: "jDNtQQ13iBDvK4pPOhlxYagU5abHmEXY"
  // Forcing every model's generated id to a real UUID fixes the `users`
  // insert; it's still a valid value for the `text` id columns on
  // accounts/sessions/verification, so nothing else needs to change.
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  // `createBalanceForUser` in apps/api/src/services/balance.service.ts exists
  // but nothing ever called it — new signups got no `balances` row at all,
  // so getBalance() fell back to { credits: 0 } (chat: 402 INSUFFICIENT_BALANCE)
  // and creditBalance() (redeem/admin grant/payment webhook) threw "Balance
  // row not found for user" since it does a plain UPDATE, not an upsert.
  // Create the row the moment the user account exists so credits can always
  // land on it later, regardless of verification status.
  databaseHooks: {
    session: {
      create: {
        after: async (
          session: { userId: string },
          ctx?: { request?: Request | undefined; headers?: Headers | undefined } | null
        ) => {
          await ensureUserSetup(session.userId, ctx?.headers ?? ctx?.request?.headers);
        },
      },
    },
    user: {
      create: {
        after: async (
          user: { id: string },
          ctx?: { request?: Request | undefined; headers?: Headers | undefined } | null
        ) => {
          // Wrapped: for a Google signup this can run before the user row is
          // committed (FK failure). ensureUserSetup() in the session hook
          // below creates the row on the first login instead.
          try {
            await db.insert(balances)
              .values({ userId: user.id, credits: SIGNUP_BONUS_MICRO_CREDITS })
              .onConflictDoNothing();
          } catch (err) {
            console.error("Balance row insert deferred to first login:", err);
          }

          // Referral capture (decisions.md ADR-009). Deliberately placed
          // here rather than in `create.before`'s `{ data }` return: this
          // codebase already proves `create.after` reliably sees the
          // committed row for email/password signup (see the balances
          // insert immediately above) — the known databaseHooks timing
          // issue (better-auth#7260) is specific to social-login/OAuth,
          // which this app now also uses (Google) — see ensureUserSetup() above. The `x-referral-code` header
          // travels the same way `x-turnstile-token` does below: better-
          // auth's sign-up schema doesn't accept arbitrary extra body
          // fields, so it can't just be a normal field.
          //
          // Never throws: a bad/missing header or a lookup hiccup must
          // never fail a real signup over referral attribution, which is
          // a nice-to-have, not a requirement.
          try {
            const headers = ctx?.headers ?? ctx?.request?.headers;
            const refCode = headers?.get("x-referral-code")?.trim().toUpperCase();

            let referredByUserId: string | undefined;
            if (refCode) {
              const referrer = await db.query.users.findFirst({
                where:   eq(users.referralCode, refCode),
                columns: { id: true },
              });
              if (referrer) referredByUserId = referrer.id;
            }

            // Retry-on-collision — column is UNIQUE, collision odds on a
            // 32-char alphabet ^ 8 space are astronomically low.
            let referralCode = generateReferralCode();
            for (let attempt = 0; attempt < 5; attempt++) {
              const clash = await db.query.users.findFirst({
                where:   eq(users.referralCode, referralCode),
                columns: { id: true },
              });
              if (!clash) break;
              referralCode = generateReferralCode();
            }

            await db.update(users)
              .set({ referralCode, ...(referredByUserId ? { referredByUserId } : {}) })
              .where(eq(users.id, user.id));
          } catch (err) {
            console.error("Referral capture failed (signup still succeeded):", err);
          }
        },
      },
    },
  },

  // P3.5 (owner-approved frozen-zone exception): the default storage is
  // per-process memory, so on Vercel every serverless instance counted
  // separately and "5 per minute" was really "5 per minute per instance".
  // "database" makes the counter shared. Requires migration 0019 to be applied
  // BEFORE this ships (docs/runbooks/SECURITY_SWEEP.md).
  rateLimit: { window: 60, max: 5, storage: "database" },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // Better Auth's `emailVerified` flag is separate from your own
    // `users.status` enum — the API's auth middleware gates chat access on
    // `status === "active"`, not on `emailVerified`. Without this, every
    // signup verifies successfully but stays "pending_verification"
    // forever, and every chat request gets a 403 "Account suspended".
    afterEmailVerification: async (user: { id: string }) => {
      await db.update(users)
        .set({ status: "active" })
        .where(eq(users.id, user.id));
    },
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string };
      url: string;
    }) => {
      // Import Resend directly here — avoids pulling in apps/api/src/config.ts
      // which runs process.exit(1) if API-specific env vars are absent.
      //
      // Wrapped in try/catch: this fires mid-signup, so a Resend failure
      // (missing/invalid RESEND_API_KEY, network issue) must not throw —
      // otherwise better-auth surfaces it as a generic sign-up failure and
      // the account never gets created, even though email/password were fine.
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY!);
        const name   = user.name ?? "";
        await resend.emails.send({
          from:    `${process.env.RESEND_FROM_NAME ?? "OpenPortal"} <${process.env.RESEND_FROM_EMAIL ?? "noreply@yourplatform.com"}>`,
          to:      user.email,
          subject: "تأكيد البريد الإلكتروني | Verify Your Email",
          html: `
            <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;">
              <h2 style="margin-bottom:16px;">مرحباً ${name} 👋</h2>
              <p style="margin-bottom:24px;">
                انقر على الزر أدناه لتأكيد بريدك الإلكتروني والبدء في استخدام المنصة.
              </p>
              <a href="${url}" style="
                display:inline-block;padding:12px 28px;
                background:#2563EB;color:#fff;border-radius:8px;
                text-decoration:none;font-weight:600;
              ">
                تأكيد البريد الإلكتروني
              </a>
              <p style="margin-top:24px;color:#94A3B8;font-size:13px;">
                إذا لم تنشئ حساباً، تجاهل هذه الرسالة.
              </p>
            </div>
          `,
        });
      } catch (err) {
        // Account still gets created; the user can request a fresh
        // verification email later via sendVerificationEmail once
        // RESEND_API_KEY / RESEND_FROM_EMAIL are confirmed correct.
        console.error("Failed to send verification email:", err);
      }
    },
  },

  user: {
    // Your `users` table uses displayName/avatarUrl instead of better-auth's
    // canonical name/image. Map them so better-auth reads/writes the right
    // columns instead of expecting columns that don't exist.
    fields: {
      name:  "displayName",
      image: "avatarUrl",
    },
    additionalFields: {
      locale:         { type: "string",  defaultValue: "ar"   },
      role:           { type: "string",  defaultValue: "user"  },
      tier:           { type: "string",  defaultValue: "free"  },
      isFraudFlagged: { type: "boolean", defaultValue: false   },
    },
  },

  // Gate registration behind Turnstile to close off scripted/bulk account
  // creation before it reaches the DB. This runs as a better-auth `before`
  // hook (rather than in the frontend only) so it can't be bypassed by
  // calling the API directly. The token travels as a request header
  // (`x-turnstile-token`) instead of a body field because better-auth's
  // sign-up schema doesn't accept arbitrary extra fields — see the client
  // call in auth/register/page.tsx for the matching side of this.
  //
  // verifyTurnstileToken() no-ops (returns success) when
  // TURNSTILE_SECRET_KEY isn't set, so this is inert until that env var is
  // configured — see apps/web/lib/turnstile-server.ts.
  // Settings → Security's 2FA section (enable/verify/disable, backup
  // codes) and the login page's post-password challenge both talk to this
  // plugin through authClient.twoFactor.* — see apps/web/lib/auth-client.ts.
  // `users.twoFactorEnabled` is the exact field name the plugin expects,
  // so no `user.fields` remapping is needed for it (unlike displayName/
  // avatarUrl below); the secret/backup codes live in the separate
  // `twoFactor` table mapped above.
  plugins: [
    twoFactor(),
    passkey({
      rpID:   passkeyRpId,
      rpName: "OpenPortal",
      origin: appBaseUrl,
    }),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      // Password strength rules (moved here — see the emailAndPassword
      // comment above for why). Runs before the Turnstile check so a
      // weak password is rejected without spending a captcha verification.
      const password = (ctx.body as { password?: string } | undefined)?.password;
      if (password) {
        if (!/[A-Z]/.test(password)) {
          throw new APIError("BAD_REQUEST", {
            message: "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل",
            code:    "WEAK_PASSWORD",
          });
        }
        if (!/[0-9]/.test(password)) {
          throw new APIError("BAD_REQUEST", {
            message: "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل",
            code:    "WEAK_PASSWORD",
          });
        }
      }

      const headers = ctx.headers ?? ctx.request?.headers;
      const token   = headers?.get("x-turnstile-token");
      const ip      = headers ? getClientIp(headers) : undefined;

      const result = await verifyTurnstileToken(token, ip);
      if (!result.success) {
        throw new APIError("BAD_REQUEST", {
          message: "captcha_failed",
          code:    "CAPTCHA_FAILED",
        });
      }
    }),
  },

  // Vercel gives every deployment (prod AND every preview) its own unique
  // domain — e.g. openportal-bl7vz4lue-abu0alis-projects.vercel.app — so a
  // single hardcoded BETTER_AUTH_URL will only ever match one of them.
  // Any request from an origin not listed here gets rejected with a 403
  // "Invalid origin" before auth logic even runs.
  //
  // NOTE: a static "https://*.vercel.app" wildcard entry was here before,
  // but it did not reliably match preview-deployment origins on the
  // pinned better-auth version (confirmed in prod logs: real preview
  // requests were rejected with "Invalid origin" despite the wildcard
  // being present). A dynamic function is honored on every better-auth
  // 1.x release, so it's used instead of relying on wildcard-string
  // matching. `request` is undefined during init / direct auth.api calls,
  // so a safe static fallback list is returned in that case.
  trustedOrigins: async (request?: Request) => {
    const fallback = [
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      "https://openportal-web.vercel.app",
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ];
    if (!request) return fallback;

    const origin = request.headers.get("origin") ?? "";
    if (origin.endsWith(".vercel.app")) return [origin, ...fallback];
    return fallback;
  },
});
