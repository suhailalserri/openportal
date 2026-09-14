import { db } from "@ai-platform/db";
import { sql } from "drizzle-orm";

/**
 * Real admin-dashboard data, replacing the hardcoded-zero page.
 *
 * Money model note: this business is YER-first (ADR-007) but provider
 * costs are billed in USD. There is no live FX feed, so margin/USD
 * figures use `packages.price_usd_equivalent` — the field that already
 * exists specifically for internal margin tracking (see credit-packages.ts)
 * — rather than inventing a conversion rate. Buyer-facing revenue stays
 * in YER; margin math stays in USD. Never mix the two without going
 * through a package's own recorded pair.
 *
 * Revenue recognition: counted at the moment money is actually confirmed —
 * a manual-transfer claim's `reviewed_at` (status = approved), or a
 * voucher/redeem code's `used_at` (status = used) when it's tied to a
 * package. Codes generated but not yet redeemed are stock, not revenue.
 */

type Row = Record<string, unknown>;

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Wholesale USD cost of chat usage in the window, priced at the rate
 *  effective at the time each request was actually billed (not today's
 *  rate) — matches Phase 5's provider_prices history design. */
async function costUsdSince(since: Date): Promise<number> {
  // NOTE: drizzle's raw `sql` tag runs through postgres-js's `client.unsafe()`
  // under the hood, which — unlike postgres.js's own tagged-template `sql`
  // calls — does NOT auto-serialize non-primitive JS values. A bare `Date`
  // interpolated here reaches the wire writer as-is and blows up with
  // "Received an instance of Date". Always pass an ISO string instead.
  const sinceIso = since.toISOString();
  const result = await db.execute(sql`
    select coalesce(sum(
      (t.input_tokens::numeric  / 1000) * coalesce(pp.input_price_usd, 0) +
      (t.output_tokens::numeric / 1000) * coalesce(pp.output_price_usd, 0)
    ), 0) as cost_usd
    from transactions t
    left join lateral (
      select input_price_usd, output_price_usd
      from provider_prices
      where model_id = t.model_id
        and effective_from <= t.created_at
        and (effective_to is null or effective_to > t.created_at)
      order by effective_from desc
      limit 1
    ) pp on true
    where t.type = 'usage_debit'
      and t.created_at >= ${sinceIso}
      and t.model_id is not null
  `);
  const rows = result as unknown as Row[];
  return num(rows[0]?.cost_usd);
}

/** Revenue actually confirmed in the window: YER (buyer-facing) and the
 *  matching USD-equivalent (margin tracking), from both funnels —
 *  approved manual transfers and redeemed package-linked codes. */
async function revenueSince(since: Date): Promise<{ yer: number; usd: number }> {
  const sinceIso = since.toISOString();
  const result = await db.execute(sql`
    select
      coalesce(sum(p.price_yer), 0)              as yer,
      coalesce(sum(p.price_usd_equivalent), 0)   as usd
    from (
      select pkg.price_yer, pkg.price_usd_equivalent
      from pending_manual_payments pm
      join packages pkg on pkg.id = pm.package_id
      where pm.status = 'approved' and pm.reviewed_at >= ${sinceIso}

      union all

      select pkg.price_yer, pkg.price_usd_equivalent
      from redeem_codes rc
      join packages pkg on pkg.id = rc.package_id
      where rc.status = 'used' and rc.used_at >= ${sinceIso}
    ) p
  `);
  const rows = result as unknown as Row[];
  return { yer: num(rows[0]?.yer), usd: num(rows[0]?.usd) };
}

function marginPercent(revenueUsd: number, costUsd: number): number | null {
  if (revenueUsd <= 0) return null; // undefined margin, not 0% — avoid implying a loss with no sales
  return ((revenueUsd - costUsd) / revenueUsd) * 100;
}

export async function getDashboardStats() {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fiveMinAgo    = new Date(now.getTime() - 5  * 60 * 1000);
  const startOfDayIso = startOfDay.toISOString();
  const fiveMinAgoIso = fiveMinAgo.toISOString();

  const [
    revToday, rev7d, rev30d,
    costToday, cost7d, cost30d,
    countsResult,
  ] = await Promise.all([
    revenueSince(startOfDay),
    revenueSince(sevenDaysAgo),
    revenueSince(thirtyDaysAgo),
    costUsdSince(startOfDay),
    costUsdSince(sevenDaysAgo),
    costUsdSince(thirtyDaysAgo),
    db.execute(sql`
      select
        (select count(*) from users)                                        as total_users,
        (select count(*) from users where created_at >= ${startOfDayIso})   as new_users_today,
        (select count(*) from users where last_seen_at >= ${fiveMinAgoIso}) as active_users,
        (select count(*) from redeem_codes where status = 'used'
           and used_at >= ${startOfDayIso})                                 as codes_redeemed_today,
        (select count(*) from transactions where type = 'usage_debit'
           and created_at >= ${startOfDayIso})                              as requests_today
    `),
  ]);

  const counts = (countsResult as unknown as Row[])[0] ?? {};

  return {
    totalUsers:         num(counts.total_users),
    newUsersToday:      num(counts.new_users_today),
    activeUsers:        num(counts.active_users),
    codesRedeemedToday: num(counts.codes_redeemed_today),
    requestsToday:      num(counts.requests_today),
    revenue: {
      todayYer: revToday.yer, today30dUsd: revToday.usd,
      last7dYer: rev7d.yer, last7dUsd: rev7d.usd,
      last30dYer: rev30d.yer, last30dUsd: rev30d.usd,
    },
    cost: { todayUsd: costToday, last7dUsd: cost7d, last30dUsd: cost30d },
    marginPercent: {
      today:   marginPercent(revToday.usd, costToday),
      last7d:  marginPercent(rev7d.usd, cost7d),
      last30d: marginPercent(rev30d.usd, cost30d),
    },
  };
}

/** Daily revenue/cost series for the last N days, oldest first — feeds
 *  the "Revenue vs Cost" chart described in Phase 16.1 of the plan. */
export async function getRevenueTimeseries(days = 14) {
  const result = await db.execute(sql`
    with days as (
      select generate_series(
        date_trunc('day', now()) - make_interval(days => ${days - 1}),
        date_trunc('day', now()),
        interval '1 day'
      ) as day
    ),
    revenue as (
      select date_trunc('day', event_at) as day,
             sum(price_yer) as revenue_yer, sum(price_usd_equivalent) as revenue_usd
      from (
        select pm.reviewed_at as event_at, pkg.price_yer, pkg.price_usd_equivalent
        from pending_manual_payments pm
        join packages pkg on pkg.id = pm.package_id
        where pm.status = 'approved' and pm.reviewed_at >= date_trunc('day', now()) - make_interval(days => ${days - 1})

        union all

        select rc.used_at as event_at, pkg.price_yer, pkg.price_usd_equivalent
        from redeem_codes rc
        join packages pkg on pkg.id = rc.package_id
        where rc.status = 'used' and rc.used_at >= date_trunc('day', now()) - make_interval(days => ${days - 1})
      ) x
      group by 1
    ),
    cost as (
      select date_trunc('day', t.created_at) as day,
             sum(
               (t.input_tokens::numeric  / 1000) * coalesce(pp.input_price_usd, 0) +
               (t.output_tokens::numeric / 1000) * coalesce(pp.output_price_usd, 0)
             ) as cost_usd
      from transactions t
      left join lateral (
        select input_price_usd, output_price_usd
        from provider_prices
        where model_id = t.model_id
          and effective_from <= t.created_at
          and (effective_to is null or effective_to > t.created_at)
        order by effective_from desc
        limit 1
      ) pp on true
      where t.type = 'usage_debit' and t.model_id is not null
        and t.created_at >= date_trunc('day', now()) - make_interval(days => ${days - 1})
      group by 1
    )
    select
      to_char(d.day, 'YYYY-MM-DD') as date,
      coalesce(r.revenue_yer, 0) as revenue_yer,
      coalesce(r.revenue_usd, 0) as revenue_usd,
      coalesce(c.cost_usd, 0)    as cost_usd
    from days d
    left join revenue r on r.day = d.day
    left join cost c    on c.day = d.day
    order by d.day asc
  `);

  return (result as unknown as Row[]).map((r) => ({
    date:       String(r.date),
    revenueYer: num(r.revenue_yer),
    revenueUsd: num(r.revenue_usd),
    costUsd:    num(r.cost_usd),
  }));
}

/** Per-model usage for the last N days — requests, tokens, credits spent
 *  (what users actually paid, in display credits). */
export async function getModelUsageBreakdown(days = 7) {
  const result = await db.execute(sql`
    select
      model_id,
      count(*) as requests,
      sum(input_tokens)  as input_tokens,
      sum(output_tokens) as output_tokens,
      sum(-amount) / 1000000.0 as credits_spent
    from transactions
    where type = 'usage_debit'
      and model_id is not null
      and created_at >= now() - make_interval(days => ${days})
    group by model_id
    order by credits_spent desc
    limit 20
  `);

  return (result as unknown as Row[]).map((r) => ({
    modelId:      String(r.model_id),
    requests:     num(r.requests),
    inputTokens:  num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    creditsSpent: num(r.credits_spent),
  }));
}

/** Last N transactions across all users, for the dashboard's live feed —
 *  joined to the user's email since transactions only store userId. */
export async function getRecentTransactions(limit = 20) {
  const result = await db.execute(sql`
    select t.id, t.type, t.amount, t.model_id, t.description, t.created_at,
           u.email as user_email
    from transactions t
    join users u on u.id = t.user_id
    order by t.created_at desc
    limit ${limit}
  `);

  return (result as unknown as Row[]).map((r) => ({
    id:          String(r.id),
    type:        String(r.type),
    amount:      num(r.amount) / 1_000_000,
    modelId:     r.model_id ? String(r.model_id) : null,
    description: r.description ? String(r.description) : null,
    userEmail:   String(r.user_email),
    createdAt:   r.created_at as Date,
  }));
}
