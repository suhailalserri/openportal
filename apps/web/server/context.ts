import { auth }              from "@/lib/auth";
import { db, users }         from "@ai-platform/db";
import { eq }                from "drizzle-orm";
import { resolveWebClientIp } from "@ai-platform/api/utils/client-ip";

export async function createContext(req: Request) {
  const session = await auth.api.getSession({ headers: new Headers(req.headers) })
    .catch(() => null);

  // Fetch the full row rather than using better-auth's session.user directly
  // — that object is missing passwordHash/apiKeyHash/twoFactorSecret/etc.,
  // and the shared appRouter's Context type (apps/api/routers/trpc.ts)
  // expects the full Drizzle row, since apps/api's own createContext
  // supplies exactly that. Mismatched shapes here silently broke
  // procedures like changePassword when run through this path.
  const user = session?.user
    ? await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
    : null;

  // Mirrors apps/api/src/routers/trpc.ts's ip extraction — Context.ip must
  // exist regardless of which platform (Fastify or Next.js) supplies it,
  // since both call into the same shared appRouter.
  // P1.3 (owner-approved frozen-zone edit): shared web resolver. Reads only
  // Vercel-set headers on Vercel and never cf-connecting-ip, which a caller
  // could forge because no Cloudflare sits in front of Vercel here.
  const ip = resolveWebClientIp((name) => req.headers.get(name)) ?? "unknown";

  return { db, user, ip };
}
