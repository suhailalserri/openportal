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
