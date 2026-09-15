import { betterAuth }      from "better-auth";
import { drizzleAdapter }  from "better-auth/adapters/drizzle";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { twoFactor }       from "better-auth/plugins";
import { db }              from "@ai-platform/db";
import {
  users, sessions, accounts, verifications, balances,
  twoFactor as twoFactorTable,
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
  baseURL: process.env.BETTER_AUTH_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),

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

  session: {
    expiresIn:   60 * 60 * 24 * 7,  // 7 days
    updateAge:   60 * 60 * 24,      // Refresh after 1 day of use
    cookieCache: { enabled: true, maxAge: 60 * 5 },
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
    user: {
      create: {
        after: async (
          user: { id: string },
          ctx?: { request?: Request | undefined; headers?: Headers | undefined } | null
        ) => {
          await db.insert(balances)
            .values({ userId: user.id, credits: SIGNUP_BONUS_MICRO_CREDITS })
            .onConflictDoNothing();

          // Referral capture (decisions.md ADR-009). Deliberately placed
          // here rather than in `create.before`'s `{ data }` return: this
          // codebase already proves `create.after` reliably sees the
          // committed row for email/password signup (see the balances
          // insert immediately above) — the known databaseHooks timing
          // issue (better-auth#7260) is specific to social-login/OAuth,
          // which this app doesn't use. The `x-referral-code` header
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

  rateLimit: { window: 60, max: 5 },

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
  plugins: [twoFactor()],

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
