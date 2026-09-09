# Pre-Launch Checklist

Track all non-code tasks that must be completed before accepting real users.

---

## Phase 0.3 — Business & Legal Foundation

### Entity & Banking
- [ ] Legal entity formed (LLC / sole proprietor / etc.)
- [ ] Business bank account opened
- [ ] Stripe account created and verified (or local payment gateway)
- [ ] PayPal business account (optional secondary)

### Tax & Compliance
- [ ] VAT registration completed (if applicable in your jurisdiction)
- [ ] Jurisdiction filled in legal docs (`[YOUR JURISDICTION — MUST BE FILLED BEFORE LAUNCH]`)
- [ ] Legal docs reviewed by a lawyer (ToS, Privacy Policy, AUP)
- [ ] Cookie consent banner implemented (required for EU users)

### Domain & Email
- [ ] Production domain purchased and DNS configured
- [ ] Email addresses created: support@, privacy@, abuse@, noreply@
- [ ] Email DNS records set: SPF, DKIM, DMARC (for Resend deliverability)
- [ ] Legal doc email placeholders updated from `@yourplatform.com`

---

## Phase 0.4 — Infrastructure Readiness

### Secrets
- [ ] `CODE_SALT` generated: `openssl rand -hex 32`
- [ ] `BETTER_AUTH_SECRET` generated: `openssl rand -hex 32`
- [ ] `INTERNAL_SERVICE_TOKEN` generated: `openssl rand -hex 32`
- [ ] `GATEWAY_MASTER_KEY` generated and set in New API
- [ ] All secrets stored in password manager / secrets vault

### Services
- [ ] VPS / cloud provider provisioned (min 4 vCPU, 8 GB RAM)
- [ ] Docker + Docker Compose installed on server
- [ ] Caddy TLS working (domain resolves, HTTPS cert issued)
- [ ] New API gateway pinned to specific version (`v0.6.9`) and provider keys added
- [ ] MinIO bucket `uploads` created and access policy set
- [ ] Resend API key created and sending domain verified

### Database
- [ ] PostgreSQL initial migration run: `pnpm db:migrate`
- [ ] Post-migration constraints applied: `psql $DATABASE_URL < packages/db/src/migrations/0001_constraints.sql`
- [ ] Seed run for admin user: `pnpm db:seed`
- [ ] Backup cron configured (daily `pg_dump` to offsite storage)

---

## Phase 0.5 — Pre-Launch Testing

- [ ] Full registration → email verify → login flow tested
- [ ] Redeem code flow tested end-to-end (generate → redeem → balance credited)
- [ ] Chat with at least 3 different models tested (balance deducted correctly)
- [ ] Admin dashboard accessible at `/admin`
- [ ] Fraud system: manual flag test
- [ ] Load test: 50 concurrent chat users (check connection pool + Redis)

---

## Phase 0.6 — Go-Live

- [ ] `NODE_ENV=production` set in all containers
- [ ] Grafana + Prometheus dashboards reviewed and alerts configured
- [ ] Telegram alert bot connected (set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)
- [ ] Error monitoring set up (Sentry or similar)
- [ ] New API model pricing confirmed against your `markupMultiplier` settings
- [ ] Announcement posted (Telegram channel, social, etc.)
