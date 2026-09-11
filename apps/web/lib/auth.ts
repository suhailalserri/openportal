import { betterAuth }      from "better-auth";
import { drizzleAdapter }  from "better-auth/adapters/drizzle";
import { db }              from "@ai-platform/db";
import { users, sessions, accounts, verifications } from "@ai-platform/db";

export const auth = betterAuth({
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
    },
  }),

  emailAndPassword: {
    enabled:                  true,
    requireEmailVerification: true,
    minPasswordLength:        8,
    validatePassword: (password: string) => {
      if (!/[A-Z]/.test(password)) return "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل";
      if (!/[0-9]/.test(password)) return "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل";
      return true;
    },
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

  rateLimit: { window: 60, max: 5 },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
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
          from:    `${process.env.RESEND_FROM_NAME ?? "AI Platform"} <${process.env.RESEND_FROM_EMAIL ?? "noreply@yourplatform.com"}>`,
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
