import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders }    from "next/headers";
import { auth }                      from "@/lib/auth";
import { listUsageForExport }        from "@ai-platform/api/services/usage";

/**
 * B2 (docs/FRONTEND_REBUILD_PLAN.md §7): "CSV export through a user-scoped
 * REST route (GET /api/usage/export, added in B2)" — Phase 6.2's Usage Log
 * needs a plain downloadable file, which a tRPC query can't produce
 * (browsers download from a URL, not a POST body), so this mirrors
 * apps/web/app/api/redeem/route.ts's pattern: Next.js route handler,
 * session check via `auth.api.getSession`, then straight to the shared
 * service — same service the trpc `billing.listUsage` procedure uses
 * (usage.service.ts), so the export can never diverge from what the UI
 * shows, and can never read another user's rows (listUsageForExport
 * requires userId and every query inside it filters on it).
 *
 * Query params (all optional): from, to (ISO 8601 dates), modelId.
 * Same 90-day clamp as the trpc procedures — enforced server-side inside
 * usage.service.ts's clampRange(), not duplicated here.
 */
export async function GET(req: NextRequest) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params  = req.nextUrl.searchParams;
  const fromRaw = params.get("from");
  const toRaw   = params.get("to");
  const modelId = params.get("modelId") ?? undefined;

  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to   = toRaw   ? new Date(toRaw)   : undefined;
  if ((fromRaw && Number.isNaN(from?.getTime())) || (toRaw && Number.isNaN(to?.getTime()))) {
    return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
  }

  const rows = await listUsageForExport(session.user.id, { from, to, modelId });

  const header = "id,created_at,model_id,input_tokens,output_tokens,credits_spent,request_id";
  const csvRows = rows.map((r) => {
    // credits_spent as a display figure (micro-credits / 1,000,000),
    // matching formatCredits()'s convention elsewhere — amount is
    // negative for a debit, flip sign for a human-readable positive spend.
    const creditsSpent = (-r.amount / 1_000_000).toFixed(6);
    return [
      r.id,
      r.createdAt.toISOString(),
      r.modelId ?? "",
      r.inputTokens ?? "",
      r.outputTokens ?? "",
      creditsSpent,
      r.requestId ?? "",
    ]
      // Minimal CSV escaping: wrap any field containing a comma/quote/newline
      // in quotes and double up internal quotes. modelId/requestId are the
      // only free-text-ish fields here; ids and numbers never need it, but
      // this is applied uniformly rather than special-cased per column.
      .map((field) => {
        const s = String(field);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const from8 = (from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  const to8   = (to ?? new Date()).toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="usage-${from8}_${to8}.csv"`,
    },
  });
}
