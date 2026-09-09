import { auth }         from "@/lib/auth";
import { db }           from "@ai-platform/db";

export async function createContext(req: Request) {
  const session = await auth.api.getSession({ headers: new Headers(req.headers) })
    .catch(() => null);
  return { db, user: session?.user ?? null };
}
