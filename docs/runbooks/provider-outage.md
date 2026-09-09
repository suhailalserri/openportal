# Runbook: AI Provider Outage

**Trigger:** Grafana alert `ProviderAllChannelsFailed` OR Telegram alert from Gatus

---

## Step 1 — Identify (< 2 minutes)

```bash
# Check which provider is failing
docker compose logs gateway --tail=50 | grep -i "error\|fail\|429\|503"

# Check provider status pages:
# OpenAI:    https://status.openai.com
# Anthropic: https://anthropic.statuspage.io
# Google:    https://status.cloud.google.com
# DeepSeek:  https://status.deepseek.com
```

## Step 2 — Is It Them or Us?

**It's THEM (provider outage):**
- Their status page shows incident ✓
- Action: Wait for recovery, users see degraded banner automatically

**It's US:**
- Did your API key expire or get revoked? → Check email from provider
- Did your provider balance hit $0? → Top up immediately
- Did you exceed rate limits? → Check usage dashboard

## Step 3 — Mitigate

```bash
# Log into New API admin (internal only)
# → Channels → Disable failed channels
# → Enable backup channels / route to working provider

# If balance ran out with provider:
# Top up → balance reflects in ~5 min → re-enable channel
```

## Step 4 — Communicate (if outage > 15 minutes)

Post in support Telegram/WhatsApp group:
> "نعتذر عن الانقطاع. نموذج [X] غير متاح مؤقتاً بسبب مشكلة لدى المزود.
> يمكنك استخدام [Y] في هذه الأثناء. نعمل على الحل."

## Step 5 — Recovery

```bash
# Re-enable channels after provider reports resolution
# Monitor error rate for 10 min:
# → Grafana → Provider Health dashboard → watch error rate
```

## Post-Incident

- Log incident in `docs/incidents/YYYY-MM-DD-provider-name.md`
- Note: duration, affected users, estimated lost requests
- Update runbook if new patterns discovered
