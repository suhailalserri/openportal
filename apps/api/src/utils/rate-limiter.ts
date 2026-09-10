// Pure, framework-agnostic in-memory rate limiter (replace with Redis in
// production). Deliberately has ZERO dependency on Fastify types.
//
// This used to live in the same file as the Fastify preHandler
// (rateLimit.middleware.ts), which touches FastifyRequest's `user` property.
// user.router.ts (part of the shared tRPC appRouter, re-exported into
// apps/web — see apps/web/server/router.ts) imports `checkLimit` from here.
// Because apps/web's Next.js build type-checks its full reachable import
// graph, having checkLimit share a file with Fastify-specific code meant
// apps/web's build was transitively type-checking Fastify request-handling
// code it never runs — and failing, because the `request.user` ambient
// type augmentation (declared in auth.middleware.ts) isn't part of
// apps/web's TypeScript program. Keeping this file Fastify-free avoids
// that class of bug entirely, regardless of which side imports it.
const counters = new Map<string, { count: number; resetAt: number }>();

export function checkLimit(key: string, max: number, windowMs: number): boolean {
  const now   = Date.now();
  const entry = counters.get(key);

  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > max) return false;
  return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of counters) {
    if (now > entry.resetAt) counters.delete(key);
  }
}, 5 * 60 * 1000);
