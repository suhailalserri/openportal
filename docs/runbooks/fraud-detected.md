> ⚠️ **VPS-ERA RUNBOOK — PARTLY SUPERSEDED (2026-09-29).** Production is Vercel (web), Render (api + gateway), Supabase (Postgres) and Upstash (Redis) — see ADR-011 in `docs/architecture/decisions.md`. There is no VPS, Docker Compose, Caddy, Grafana or Gatus.
>
> The **triage decision tree** is still valid and useful. The **IP-block commands** (edit `Caddyfile`, `docker compose exec caddy`) are not — there is no Caddy. Blocking an IP now means the Vercel firewall or Cloudflare, or account-level suspension in `/admin`. Revisit with plan P1.1 / P1.3.

---

# Runbook: Fraud Alert

**Trigger:** Telegram alert `FRAUD_USER_AUTO_FLAGGED` or admin panel alert

---

## Step 1 — Triage (< 5 minutes)

Open admin panel → `/admin/fraud`

Check the fraud event:
- **Type:** What triggered it?
- **Severity:** Low / Medium / High / Critical
- **User:** Who is it?
- **Details:** IPs, request counts, spend amounts

**Before trusting the numbers:** check whether a `RedisMemoryHigh` or
`ExporterDown` alert fired around the same time. Every fraud check
(`checkRequestVelocity`, `checkRedeemAttempt`, `checkSpendVelocity` in
`fraud.service.ts`) fails OPEN on a Redis error — it skips the check
rather than blocking the request. So a Redis blip doesn't just degrade
the app; it also means fraud checks were silently off for that window.
If the two alerts overlap, treat this event's counts as a floor, not a
complete picture — some abuse in that window may not have been caught
or logged at all.

## Step 2 — Classify

**Likely legitimate user (false positive):**
- VPN user hitting multiple IPs
- Developer testing their integration
- User on shared WiFi/office network

**Likely actual fraud:**
- Redeem code brute-force attempts
- Unusually high spend right after redeeming a large code
- Multiple accounts from same IP buying codes

## Step 3 — Act

**False positive:**
```
Admin panel → Users → [user] → Clear Fraud Flag
Admin panel → Fraud → [event] → Mark Resolved
Optionally: Email user to explain and apologize
```

**Confirmed fraud:**
```
Admin panel → Users → [user] → Suspend Account
Admin panel → Fraud → [event] → Mark Resolved (with note)
If stolen code used: Admin → Codes → Revoke the code
If victim exists: Admin → Users → [victim] → Add Credits (refund)
```

**IP-level block (severe cases):**
```bash
# Add to Caddy IP block (edit Caddyfile):
@blocked_ip remote_ip 1.2.3.4 5.6.7.8
handle @blocked_ip { respond "Forbidden" 403 }

# Reload Caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Step 4 — Tune

If false positives are frequent → adjust thresholds in:
`packages/config/src/constants.ts` → `FRAUD` object
