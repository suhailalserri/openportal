# 🧠 Enterprise AI Aggregator & Proxy Platform
## Complete Master Implementation Plan — Version 2.0
### "Think Big, Build Smart, Scale Forever"

> Version 2.0 adds: Legal framework, fraud prevention, operational runbooks,
> chat edge cases, business resilience, local payments, and complete launch checklist.

---

## 📋 TABLE OF CONTENTS

### PRE-BUILD
- Phase 0 — Legal, Compliance & Business Foundation

### INFRASTRUCTURE
- Phase 1 — Technology Stack Decision Matrix
- Phase 2 — System Architecture Blueprint
- Phase 3 — Repository & Monorepo Structure
- Phase 4 — Server Setup & Infrastructure

### BACKEND
- Phase 5 — Database Design & Schema
- Phase 6 — Authentication & Session Management
- Phase 7 — Backend Gateway & API Engine
- Phase 8 — Fraud Prevention & Abuse Protection
- Phase 9 — Billing, Token Ledger & Redeem System
- Phase 10 — Background Jobs & Queue System
- Phase 11 — Email & Notification System

### FRONTEND
- Phase 12 — Frontend Architecture & Design System
- Phase 13 — Arabic RTL & Full Localization
- Phase 14 — Chat Interface & Edge Cases
- Phase 15 — Billing UI & Payment Flows
- Phase 16 — Admin Dashboard
- Phase 17 — User Settings & API Access

### OPERATIONS
- Phase 18 — Observability, Monitoring & Alerting
- Phase 19 — DevOps, CI/CD & Zero-Downtime Deployment
- Phase 20 — Incident Runbooks & Operational Playbooks
- Phase 21 — Status Page & User Communication

### BUSINESS
- Phase 22 — Business Logic & Pricing Engine
- Phase 23 — Local Payment Gateway Integration
- Phase 24 — Growth Features
- Phase 25 — Scalability Roadmap

### LAUNCH
- Security Hardening Master Checklist
- Complete Build Order — Day by Day
- Launch Checklist

---

## Phase 0 — Legal, Compliance & Business Foundation

> Do this BEFORE writing a single line of code. Getting banned by a provider
> after 5,000 users have paid you is a business-ending event.

### 0.1 AI Provider Terms of Service — The Real Rules

```
OPENAI
  Allowed:    Build products powered by the API
  Restricted: Cannot use the Services to develop competing models
  Your model: You hold ONE master key. Users auth to YOUR platform.
              This is the standard "powered by OpenAI" model.
  Review: platform.openai.com/docs/usage-policies

ANTHROPIC / GOOGLE GEMINI / DEEPSEEK
  All follow the same pattern: building a product = allowed.
  Never market as "cheaper API access" — say "AI chat platform."
  Never let users bring their own API keys (changes liability model).

SAFE OPERATING RULES:
  You hold all API keys — users never see them
  Users authenticate to YOUR platform, not to providers
  Your ToS prohibits users from attempting to extract your API keys
```

### 0.2 Documents Required Before Launch

```
1. TERMS OF SERVICE
   Credits are non-refundable
   Credits expire after 12 months
   Platform may change model availability without notice
   Prohibited uses: harmful content, jailbreaking, automation abuse
   Account termination rights for fraud or abuse
   Platform not liable for AI output accuracy
   Governing law: your jurisdiction

2. PRIVACY POLICY
   What data you collect (email, conversations, usage logs)
   Retention: conversations 90 days, logs 30 days
   Conversations NOT used to train models (say this clearly)
   Third parties: which AI providers receive messages
   User rights: delete account + all data
   Cookie policy

3. ACCEPTABLE USE POLICY
   Prohibited content categories
   Automated usage / bot policy
   Rate limits acknowledgment

Use getterms.io or termly.io for initial drafts, then lawyer review ($200-500 one-time).
```

### 0.3 Business Entity & Financial Setup

```
ENTITY:
  Saudi Arabia: Single Person Company (SPC) or LLC
  UAE:          Freezone LLC (tax-friendly, fastest setup)
  Jordan/Egypt: Standard LLC

BANKING:
  Business bank account (personal accounts get frozen for "suspicious" volume)
  USD account for paying AI providers
  Local currency account for receiving user payments

FINANCIAL BUFFERS:
  Keep 30-day API cost buffer pre-funded with each provider
  Set spending alerts at $500, $1000, $2000 per provider
  Never let OpenAI/Anthropic balance drop below $100

COMPLIANCE:
  Saudi Arabia: VAT registration if revenue > 375,000 SAR/year (15% VAT)
  UAE:          5% VAT on digital services
  GDPR:         If any EU users — cookie consent + right to deletion
```

---

## Phase 1 — Technology Stack Decision Matrix

```
Layer                  Technology              Why

Backend Gateway        New API (Go)            Active fork of One API. PostgreSQL native,
                                               built-in billing, smart failover. Go = low
                                               memory, high concurrency (50MB vs 500MB Node)

Custom API Layer       Node.js 20 + Fastify 5  Business logic New API cannot handle:
                                               redeem codes, webhooks, fraud checks, local
                                               payments. Fastify is 2x faster than Express.

Frontend               Next.js 15 + React 19   Full RTL control, custom branding, streaming
                       (App Router)            RSC. Custom-built, NOT LobeChat/OpenWebUI.

Admin Dashboard        Next.js /admin group    Shared types, auth, components. No separate
                                               app to maintain.

UI Components          shadcn/ui + Radix UI    Unstyled primitives = full RTL control.
                                               MUI/Ant fight RTL layouts badly.

Styling                Tailwind CSS v4         RTL utilities built-in (ps-, pe-, ms-, me-).
                                               Smallest production CSS output.

Internationalization   next-intl v4            Best Next.js i18n. RSC support, RTL-aware.

AI Streaming           Vercel AI SDK v4        useChat with SSE, reconnection, abort signal,
                                               works with any OpenAI-compatible endpoint.

Primary Database       PostgreSQL 16           ACID for billing. JSONB for configs.
                                               Row-level security. pg_cron for maintenance.

ORM                    Drizzle ORM v2          Type-safe, zero overhead. Prisma too heavy
                                               for high-frequency billing writes.

Cache & Sessions       Valkey 8 (Redis fork)   Sessions, rate limits, fraud counters,
                                               BullMQ queues. OSS Redis, Apache license.

Authentication         Better Auth v2          Modern, open-source, email/password, OAuth2,
                                               2FA, works natively with Drizzle.

Email                  Resend + React Email    Arabic RTL email templates via React.
                                               Best developer API for transactional email.

File Storage           MinIO (self-hosted)     S3-compatible. User avatars, exports,
                                               receipts. Migrate to Cloudflare R2 at scale.

Reverse Proxy          Caddy v2                Auto HTTPS / Let's Encrypt zero config.
                                               HTTP/3 support. Simpler than Nginx.

Containerization       Docker + Compose v2     Reproducible. One command to start all.

Monitoring             Grafana + Prometheus    Industry standard, free, self-hosted,
                       + Loki                  full metrics and log aggregation.

Status Page            Gatus (self-hosted)     Lightweight public status page.

Job Queue              BullMQ + Redis          Background jobs: email, payments, reports,
                                               log pruning, sync tasks.

Validation             Zod v4                  Shared between frontend and backend.
                                               Single source of truth for schemas.

API Type Safety        tRPC v11                End-to-end typesafe. Frontend calls backend
                                               like local functions.

Fraud Detection        Custom (Redis-based)    Rate counters, IP tracking, velocity checks.
                                               No third-party dependency.

CAPTCHA                Cloudflare Turnstile    Free, privacy-friendly, no puzzles.
                                               Excellent Arabic UX.

Monorepo               Turborepo + pnpm        Shared packages, parallel builds, cache.
                                               pnpm is 3x faster than npm.
```

---

## Phase 2 — System Architecture Blueprint

```
INTERNET / USERS
      |
      | HTTPS :443
      |
CLOUDFLARE (CDN + DDoS Protection — free tier)
      |
CADDY REVERSE PROXY
  chat.domain.com    → web:3000
  api.domain.com     → gateway:3001
  monitor.domain.com → grafana:3000 (IP-restricted)
  status.domain.com  → gatus:8080 (public)
      |
  ┌───┴──────────────┬──────────────────┐
  |                  |                  |
NEXT.JS WEB      NODE.JS API       NEW API GW
:3000            :4000              :3001
  |                  |                  |
  └──────────────────┴──────────────────┘
                      |
         ┌────────────┼────────────────┐
         |            |                |
    POSTGRESQL      VALKEY          MINIO
    :5432           :6379           :9000
         |            |
    PROMETHEUS      LOKI
         |            |
         └────────────┘
              |
          GRAFANA
              |
    AI PROVIDER APIS
    OpenAI | Anthropic | Gemini | DeepSeek
```

### Complete Request Lifecycle

```
[1] User types message → Next.js useChat hook

[2] Node.js Middleware pre-flight:
    ✓ Valid session? (Redis)
    ✓ Account active? (not suspended)
    ✓ Balance > 0? (Postgres)          ← BLOCK if zero
    ✓ Rate limit OK? (Redis counter)   ← BLOCK if abusing
    ✓ Token estimate within limit?     ← BLOCK if too long
    ✓ Fraud signals clear?             ← BLOCK if flagged

[3] Forward to New API Gateway

[4] New API selects best channel:
    Primary → upstream provider
    If 429/500 → failover to backup
    If all fail → graceful error with Arabic message

[5] Stream response back through middleware to frontend
    (Middleware passes chunks immediately, zero buffering)

[6] On stream complete:
    Atomic credit deduction:
    UPDATE balances SET credits = credits - X
    WHERE credits >= X (cannot go negative)
    Insert transaction record
    Save message to DB (async)

[7] Frontend renders real-time tokens
    Balance widget updates
```

---

## Phase 3 — Repository & Monorepo Structure

```
ai-platform/
├── apps/
│   ├── web/                          Next.js 15 (chat + admin)
│   │   ├── app/
│   │   │   ├── [locale]/             /ar/... and /en/...
│   │   │   │   ├── layout.tsx        Sets dir="rtl/ltr", fonts
│   │   │   │   ├── chat/
│   │   │   │   │   ├── page.tsx      New conversation
│   │   │   │   │   └── [id]/page.tsx Existing conversation
│   │   │   │   ├── auth/
│   │   │   │   │   ├── login/
│   │   │   │   │   ├── register/
│   │   │   │   │   ├── verify/
│   │   │   │   │   ├── forgot/
│   │   │   │   │   └── reset/
│   │   │   │   ├── billing/
│   │   │   │   │   ├── page.tsx      Balance + redeem + history
│   │   │   │   │   └── success/      After payment
│   │   │   │   ├── settings/
│   │   │   │   └── admin/            Role-gated route group
│   │   │   │       ├── layout.tsx    Admin auth + role guard
│   │   │   │       ├── dashboard/
│   │   │   │       ├── users/
│   │   │   │       │   └── [id]/     User detail + actions
│   │   │   │       ├── models/
│   │   │   │       ├── channels/
│   │   │   │       ├── codes/
│   │   │   │       ├── logs/
│   │   │   │       ├── fraud/        Fraud alerts + flagged users
│   │   │   │       └── settings/
│   │   │   └── api/
│   │   │       ├── trpc/[trpc]/
│   │   │       ├── auth/[...all]/
│   │   │       └── webhooks/
│   │   │           ├── payment/      Moyasar / payment processors
│   │   │           └── status/       Provider status webhooks
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatLayout.tsx
│   │   │   │   ├── ChatSidebar.tsx
│   │   │   │   ├── ChatHeader.tsx
│   │   │   │   ├── MessageList.tsx   Virtualized
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── StreamingText.tsx
│   │   │   │   ├── InputBar.tsx
│   │   │   │   ├── ModelSelector.tsx
│   │   │   │   ├── TokenCounter.tsx  Pre-send estimate
│   │   │   │   ├── BalanceWidget.tsx
│   │   │   │   ├── ErrorStates.tsx   All failure UI states
│   │   │   │   └── EmptyState.tsx
│   │   │   ├── billing/
│   │   │   │   ├── BalanceCard.tsx
│   │   │   │   ├── RedeemForm.tsx
│   │   │   │   ├── TransactionHistory.tsx
│   │   │   │   └── PricingTable.tsx
│   │   │   ├── admin/
│   │   │   │   ├── StatsCard.tsx
│   │   │   │   ├── UserTable.tsx
│   │   │   │   ├── ChannelHealth.tsx
│   │   │   │   ├── RevenueChart.tsx
│   │   │   │   ├── FraudAlerts.tsx
│   │   │   │   └── CodeBatchManager.tsx
│   │   │   └── shared/
│   │   │       ├── LanguageSwitcher.tsx
│   │   │       ├── StatusBanner.tsx  Provider outage notice
│   │   │       └── ConfirmDialog.tsx
│   │   ├── hooks/
│   │   │   ├── useBalance.ts         Real-time balance polling
│   │   │   ├── useStreamingChat.ts   Chat + abort + retry
│   │   │   └── useLocalConversation.ts IndexedDB cache
│   │   └── messages/
│   │       ├── ar.json               Arabic (PRIMARY)
│   │       └── en.json               English
│   │
│   └── api/                          Node.js Fastify middleware
│       ├── src/
│       │   ├── index.ts
│       │   ├── config.ts             All env var validation (Zod)
│       │   ├── routers/              tRPC sub-routers
│       │   │   ├── auth.router.ts
│       │   │   ├── billing.router.ts
│       │   │   ├── chat.router.ts
│       │   │   ├── admin.router.ts
│       │   │   ├── models.router.ts
│       │   │   └── user.router.ts
│       │   ├── services/
│       │   │   ├── balance.service.ts
│       │   │   ├── redeem.service.ts
│       │   │   ├── gateway.service.ts Proxy + stream handler
│       │   │   ├── fraud.service.ts
│       │   │   ├── rateLimit.service.ts
│       │   │   └── email.service.ts
│       │   └── jobs/                 BullMQ workers
│       │       ├── sendEmail.job.ts
│       │       ├── pruneOldLogs.job.ts
│       │       ├── diskCheck.job.ts
│       │       ├── weeklyReport.job.ts
│       │       ├── lowBalanceWarnings.job.ts
│       │       ├── providerBalanceCheck.job.ts
│       │       └── backupDatabase.job.ts
│       └── Dockerfile
│
├── packages/
│   ├── db/                           Shared database package
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── users.ts
│   │   │   │   ├── balances.ts
│   │   │   │   ├── transactions.ts
│   │   │   │   ├── redeem-codes.ts
│   │   │   │   ├── conversations.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── models.ts
│   │   │   │   ├── fraud-events.ts
│   │   │   │   ├── provider-prices.ts Track price changes
│   │   │   │   └── audit-logs.ts
│   │   │   ├── migrations/
│   │   │   ├── index.ts
│   │   │   └── seed.ts
│   │   └── drizzle.config.ts
│   ├── types/
│   └── config/
│       └── src/
│           ├── models.config.ts      All AI models + pricing
│           └── constants.ts
│
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── Caddyfile
│   ├── prometheus.yml
│   ├── gatus.yml                     Status page config
│   ├── grafana/dashboards/
│   └── scripts/
│       ├── deploy.sh
│       ├── backup.sh
│       ├── restore.sh
│       ├── generate-codes.ts
│       └── price-audit.ts            Margin health check
│
├── docs/
│   └── runbooks/
│       ├── provider-outage.md
│       ├── database-full.md
│       ├── high-error-rate.md
│       ├── fraud-detected.md
│       └── deploy-rollback.md
│
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Phase 4 — Server Setup & Infrastructure

### 4.1 VPS Sizing

```
LAUNCH (0-200 users):       Hetzner CX22 — 4 vCPU, 8GB RAM, 80GB SSD (~€15/mo)
GROWTH (200-2000 users):    Hetzner CX32 — 8 vCPU, 16GB RAM (~€30/mo)
SCALE (2000+ users):        Separate DB server, managed Redis

First separation to make when growing:
  PostgreSQL → Neon or Supabase (serverless, auto-scales)
  Redis      → Upstash (serverless, pay-per-request)

Provider comparison:
  Hetzner:    Best price/performance, GDPR, EU/US locations
  Vultr:      Good ME locations (Bahrain)
  Contabo:    Cheapest RAM per dollar, slower support
  DigitalOcean: Best docs, easiest onboarding
```

### 4.2 deploy.sh — Complete Server Bootstrap

```bash
#!/bin/bash
# Run as root on a fresh Ubuntu 22.04 VPS
set -euo pipefail

DEPLOY_USER="deploy"
REPO_DIR="/opt/ai-platform"

echo "=== AI Platform Server Bootstrap ==="

# 1. SYSTEM UPDATES
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget git unzip htop ncdu \
  ufw fail2ban ca-certificates gnupg lsb-release \
  cron logrotate

# Unattended security upgrades
apt-get install -y unattended-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";' \
  >> /etc/apt/apt.conf.d/20auto-upgrades

# 2. NON-ROOT DEPLOY USER
id -u $DEPLOY_USER &>/dev/null || useradd -m -s /bin/bash $DEPLOY_USER
usermod -aG sudo $DEPLOY_USER
mkdir -p /home/$DEPLOY_USER/.ssh
[ -f ~/.ssh/authorized_keys ] && \
  cp ~/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys 2>/dev/null || true

# Harden SSH: disable root login and password auth
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# 3. FIREWALL
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw allow 443/udp  comment 'HTTP3 QUIC'
echo "y" | ufw enable

# 4. FAIL2BAN
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled  = true
port     = ssh
maxretry = 5
bantime  = 3600
findtime = 600
EOF
systemctl enable fail2ban && systemctl restart fail2ban

# 5. DOCKER
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker $DEPLOY_USER

cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "no-new-privileges": true
}
EOF
systemctl restart docker && systemctl enable docker

# 6. DISK SPACE MONITORING CRON
cat > /usr/local/bin/disk-check.sh <<'EOF'
#!/bin/bash
THRESHOLD=80
USAGE=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "$USAGE" -gt "$THRESHOLD" ]; then
  echo "DISK ALERT: ${USAGE}% full" >> /var/log/disk-alerts.log
fi
EOF
chmod +x /usr/local/bin/disk-check.sh
echo "0 * * * * root /usr/local/bin/disk-check.sh" >> /etc/cron.d/disk-monitor

# 7. NODE.JS 20 (for scripts)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm tsx

# 8. PROJECT DIRECTORIES
mkdir -p $REPO_DIR $REPO_DIR/backups $REPO_DIR/logs
chown -R $DEPLOY_USER:$DEPLOY_USER $REPO_DIR

echo ""
echo "=== Setup complete! ==="
echo "Next: su - deploy, clone repo to $REPO_DIR, fill .env, run docker compose up -d"
```

---

## Phase 5 — Database Design & Schema

### 5.1 Complete Schema

```typescript
// USERS
export const users = pgTable("users", {
  id:               uuid("id").primaryKey().defaultRandom(),
  email:            varchar("email", { length: 255 }).unique().notNull(),
  passwordHash:     text("password_hash").notNull(),
  displayName:      varchar("display_name", { length: 100 }),
  role:             userRoleEnum("role").default("user").notNull(),
  status:           userStatusEnum("status").default("pending_verification").notNull(),
  emailVerified:    boolean("email_verified").default(false).notNull(),
  locale:           varchar("locale", { length: 5 }).default("ar").notNull(),
  tier:             userTierEnum("tier").default("free").notNull(),
  avatarUrl:        text("avatar_url"),
  apiKeyHash:       varchar("api_key_hash", { length: 64 }).unique(),
  apiKeyPrefix:     varchar("api_key_prefix", { length: 16 }),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret:  text("two_factor_secret"),
  isFraudFlagged:   boolean("is_fraud_flagged").default(false),
  fraudReason:      text("fraud_reason"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  lastSeenAt:       timestamp("last_seen_at"),
  lastSeenIp:       inet("last_seen_ip"),
});

// BALANCES — One row per user. Credits in micro-units (1 credit = 1,000,000)
export const balances = pgTable("balances", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id").references(() => users.id, { onDelete: "cascade" })
                    .unique().notNull(),
  credits:        bigint("credits", { mode: "number" }).default(0).notNull(),
  totalSpent:     bigint("total_spent", { mode: "number" }).default(0).notNull(),
  totalRedeemed:  bigint("total_redeemed", { mode: "number" }).default(0).notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});
// CONSTRAINT: credits >= 0 enforced at DB level

// TRANSACTIONS — Every credit movement recorded forever
export const transactions = pgTable("transactions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id).notNull(),
  type:         txTypeEnum("type").notNull(),
  amount:       bigint("amount", { mode: "number" }).notNull(), // positive=credit, negative=debit
  balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
  description:  text("description"),
  // Usage metadata
  requestId:    varchar("request_id", { length: 64 }),
  modelId:      varchar("model_id", { length: 100 }),
  inputTokens:  integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  // Redeem metadata
  redeemCodeId: uuid("redeem_code_id"),
  // Admin action metadata
  adminId:      uuid("admin_id"),
  adminNote:    text("admin_note"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

// REDEEM CODES
export const redeemCodes = pgTable("redeem_codes", {
  id:               uuid("id").primaryKey().defaultRandom(),
  code:             varchar("code", { length: 32 }).unique().notNull(),
  creditAmount:     bigint("credit_amount", { mode: "number" }).notNull(),
  faceValue:        varchar("face_value", { length: 30 }),  // "50 SAR"
  status:           codeStatusEnum("status").default("unused").notNull(),
  usedByUserId:     uuid("used_by_user_id").references(() => users.id),
  usedAt:           timestamp("used_at"),
  expiresAt:        timestamp("expires_at"),
  batchId:          uuid("batch_id").notNull(),
  batchLabel:       varchar("batch_label", { length: 100 }),
  createdByAdminId: uuid("created_by_admin_id"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

// CONVERSATIONS
export const conversations = pgTable("conversations", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id).notNull(),
  title:        text("title"),
  modelId:      varchar("model_id", { length: 100 }),
  systemPrompt: text("system_prompt"),
  isPinned:     boolean("is_pinned").default(false),
  deletedAt:    timestamp("deleted_at"),  // Soft delete
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

// MESSAGES
export const messages = pgTable("messages", {
  id:               uuid("id").primaryKey().defaultRandom(),
  conversationId:   uuid("conversation_id")
                      .references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  role:             messageRoleEnum("role").notNull(),
  content:          text("content").notNull(),
  inputTokens:      integer("input_tokens"),
  outputTokens:     integer("output_tokens"),
  creditCost:       bigint("credit_cost", { mode: "number" }),
  modelId:          varchar("model_id", { length: 100 }),
  gatewayRequestId: varchar("gateway_request_id", { length: 64 }),
  isPartial:        boolean("is_partial").default(false),
  feedback:         feedbackEnum("feedback"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

// FRAUD EVENTS
export const fraudEvents = pgTable("fraud_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").references(() => users.id),
  type:        fraudTypeEnum("type").notNull(),
  severity:    fraudSeverityEnum("severity").notNull(), // low, medium, high, critical
  details:     jsonb("details"),
  ip:          inet("ip"),
  userAgent:   text("user_agent"),
  resolved:    boolean("resolved").default(false),
  resolvedBy:  uuid("resolved_by"),
  resolvedAt:  timestamp("resolved_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// PROVIDER PRICE HISTORY — Accurate historical billing
export const providerPrices = pgTable("provider_prices", {
  id:             uuid("id").primaryKey().defaultRandom(),
  modelId:        varchar("model_id", { length: 100 }).notNull(),
  provider:       varchar("provider", { length: 50 }).notNull(),
  inputPriceUsd:  numeric("input_price_usd", { precision: 12, scale: 8 }).notNull(),
  outputPriceUsd: numeric("output_price_usd", { precision: 12, scale: 8 }).notNull(),
  effectiveFrom:  timestamp("effective_from").notNull(),
  effectiveTo:    timestamp("effective_to"),  // null = current
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

// AUDIT LOG — Every admin action, immutable
export const auditLogs = pgTable("audit_logs", {
  id:         uuid("id").primaryKey().defaultRandom(),
  adminId:    uuid("admin_id").references(() => users.id).notNull(),
  action:     varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId:   uuid("target_id"),
  before:     jsonb("before"),
  after:      jsonb("after"),
  ip:         inet("ip"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});
```

### 5.2 Critical DB Constraints & Indexes

```sql
-- Balance can never go negative (final safety net)
ALTER TABLE balances
  ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);

-- Atomic single-use code enforcement
CREATE UNIQUE INDEX idx_redeem_codes_unused
  ON redeem_codes(code) WHERE status = 'unused';

-- Performance indexes
CREATE INDEX idx_transactions_user_date  ON transactions(user_id, created_at DESC);
CREATE INDEX idx_messages_conversation   ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_conversations_user      ON conversations(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_fraud_events_unresolved ON fraud_events(created_at DESC)
  WHERE resolved = false;

-- Auto-update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 5.3 Automated Data Retention (pg_cron)

```sql
-- Runs nightly at 3 AM — controls data growth
SELECT cron.schedule('prune-old-data', '0 3 * * *', $$
  -- Delete logs older than 30 days
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '30 days';

  -- Soft-archive old conversations (free users, 90 days, not pinned)
  UPDATE conversations SET deleted_at = NOW()
  WHERE updated_at < NOW() - INTERVAL '90 days'
    AND deleted_at IS NULL AND is_pinned = false
    AND user_id IN (SELECT id FROM users WHERE tier = 'free');

  -- Mark expired unused codes
  UPDATE redeem_codes SET status = 'expired'
  WHERE status = 'unused' AND expires_at < NOW();
$$);
```

---

## Phase 6 — Authentication & Session Management

```typescript
// apps/web/lib/auth.ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,    // 7 days
    updateAge:  60 * 60 * 24,        // Refresh if > 1 day old
  },
  rateLimit: { window: 60, max: 5 },  // 5 login attempts/minute
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await emailQueue.add("sendVerification", { user, url });
    },
  },
  user: {
    additionalFields: {
      locale:         { type: "string", defaultValue: "ar" },
      role:           { type: "string", defaultValue: "user" },
      tier:           { type: "string", defaultValue: "free" },
      isFraudFlagged: { type: "boolean", defaultValue: false },
    },
    onLogin: async ({ user, request }) => {
      const ip = request.headers.get("cf-connecting-ip")
               || request.headers.get("x-forwarded-for");
      await db.update(users).set({ lastSeenAt: new Date(), lastSeenIp: ip })
              .where(eq(users.id, user.id));
    },
  },
});

// API KEY AUTH (for developer access)
// Format: sk-aip-{48 random chars}
// Stored: bcrypt-hashed, shown once on creation, prefix shown in UI
export async function generateApiKey(userId: string): Promise<string> {
  const rawKey = `sk-aip-${generateSecureRandom(48)}`;
  const keyHash = await bcrypt.hash(rawKey, 12);
  await db.update(users).set({
    apiKeyHash:   keyHash,
    apiKeyPrefix: rawKey.slice(0, 12) + "...",
  }).where(eq(users.id, userId));
  return rawKey; // Shown ONCE, never stored in plaintext
}
```

---

## Phase 7 — Backend Gateway & API Engine

### 7.1 New API Channel Strategy

```
CHANNEL CONFIGURATION:

GPT-4o:
  Channel 1 (Primary):  OpenAI key A  — priority 1, weight 100
  Channel 2 (Backup):   OpenAI key B  — priority 2, weight 50
  Channel 3 (Optional): Azure OpenAI  — priority 3, weight 25

Claude:
  Channel 1 (Primary):  Anthropic key A — priority 1
  Channel 2 (Backup):   Anthropic key B — priority 2

Gemini:
  Channel 1 (Primary):  Google AI Studio
  Channel 2 (Optional): Vertex AI

DeepSeek:
  Channel 1 (Primary):  DeepSeek Direct
  Channel 2 (Fallback): Together.ai (cheaper)

FAILOVER TRIGGERS:
  HTTP 429 (rate limit)  → immediately try next channel
  HTTP 500/502/503/504   → immediately try next channel
  Timeout > 30s          → try next channel
  3 consecutive failures → mark channel degraded, skip 5 min
  5 consecutive failures → mark channel offline

DO NOT RETRY:
  HTTP 400 (bad request — your fault, not channel's)
  HTTP 401 (auth error — channel needs fixing)

MODEL DISPLAY NAMES:
  gpt-4o           → "GPT-4o ⚡"
  claude-opus-4-8  → "Claude Opus 4.8 🆕"
  gemini-2.5-pro   → "Gemini 2.5 Pro 💎"
  deepseek-r2      → "DeepSeek R2 🧠"
```

### 7.2 Streaming Proxy with Full Error Handling

```typescript
// apps/api/src/services/gateway.service.ts

export async function proxyStreamingChat(user, requestBody, reply) {

  // PRE-FLIGHT CHECKS
  const balance = await getBalance(user.id);
  if (balance.credits <= 0) {
    return reply.status(402).send({
      error: "INSUFFICIENT_BALANCE",
      message: "رصيدك صفر. يرجى شحن حسابك.",
      redirectTo: "/billing",
    });
  }

  const model = MODEL_CATALOG.find(m => m.id === requestBody.model);
  if (!model) return reply.status(400).send({ error: "Model not found" });

  const estimatedTokens = estimateTokenCount(requestBody.messages);
  if (estimatedTokens > model.contextWindow * 0.95) {
    return reply.status(400).send({
      error: "CONTEXT_TOO_LONG",
      message: "رسالتك أطول من الحد المسموح. قلّل الرسالة أو اختر نموذجاً بسياق أوسع.",
      maxTokens: model.contextWindow,
    });
  }

  // PROXY TO GATEWAY
  let upstream;
  try {
    upstream = await fetch(`${config.GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.GATEWAY_MASTER_KEY}`,
        "X-User-ID":     user.id,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ ...requestBody, stream: true,
        stream_options: { include_usage: true } }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const msg = err.name === "TimeoutError"
      ? "انتهت مهلة الطلب. حاول مجدداً."
      : "خطأ في الاتصال بالخادم.";
    return reply.status(504).send({ error: "TIMEOUT", message: msg });
  }

  if (!upstream.ok) {
    const error = await upstream.json().catch(() => ({}));
    return reply.status(upstream.status).send(mapGatewayError(upstream.status, error));
  }

  // STREAM RESPONSE
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("X-Accel-Buffering", "no");

  const reader = upstream.body.getReader();
  let inputTokens = 0, outputTokens = 0, streamedContent = "", isPartial = true;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { isPartial = false; break; }
      const chunk = new TextDecoder().decode(value, { stream: true });
      reply.raw.write(chunk);
      // Extract content and usage from SSE chunks
      for (const match of chunk.matchAll(/"content":"([^"]*?)"/g))
        streamedContent += match[1].replace(/\\n/g, "\n");
      const usageMatch = chunk.match(/"prompt_tokens":(\d+)[^}]*"completion_tokens":(\d+)/);
      if (usageMatch) { inputTokens = +usageMatch[1]; outputTokens = +usageMatch[2]; }
    }
  } catch { /* stream interrupted — isPartial stays true */ }
  finally { reply.raw.end(); }

  // POST-STREAM BILLING (only if we got some output)
  if (outputTokens > 0 || (isPartial && streamedContent.length > 0)) {
    const cost = calculateCreditCost(model.id, inputTokens, outputTokens);
    await deductCreditsAtomic(user.id, cost, "Chat usage", { modelId: model.id,
      inputTokens, outputTokens, requestId: crypto.randomUUID() });
    saveMessageBackground({ conversationId: requestBody.conversationId,
      role: "assistant", content: streamedContent,
      inputTokens, outputTokens, creditCost: cost, modelId: model.id, isPartial })
      .catch(console.error);
  }
}

const ERROR_MESSAGES: Record<number, string> = {
  429: "تجاوزت حد الطلبات. انتظر لحظة وحاول مجدداً.",
  503: "النموذج غير متاح حالياً. جرب نموذجاً آخر.",
  400: "طلب غير صالح. حاول تعديل رسالتك.",
  500: "خطأ في الخادم. نحن نعمل على إصلاحه.",
};
const mapGatewayError = (status: number, error: any) => ({
  error: error?.error?.code || "UPSTREAM_ERROR",
  message: ERROR_MESSAGES[status] || "حدث خطأ غير متوقع.",
  status,
});
```

---

## Phase 8 — Fraud Prevention & Abuse Protection

### 8.1 Fraud Rules

```
RATE LIMITS (per user):
  API requests:     20/minute, 500/hour
  Redeem attempts:  5/hour, 20/day
  Login attempts:   5/minute (Better Auth handles this)
  Password resets:  3/hour

FRAUD SIGNALS:
  > 5 different IPs from one user in a day  → log (could be VPN)
  > 3 accounts from one IP in a day         → flag HIGH
  Spend > 1000 credits in 1 hour            → flag CRITICAL, auto-suspend
  Identical messages > 20/minute            → flag as bot
  API key used from > 3 countries/hour      → flag, notify user

AUTOMATED RESPONSES:
  LOW severity:     Log only, monitor
  MEDIUM severity:  Rate limit tightened, admin notification
  HIGH severity:    Account suspended pending review, admin alert
  CRITICAL:         Immediate auto-suspend + Telegram alert to admin
```

### 8.2 Fraud Service

```typescript
// apps/api/src/services/fraud.service.ts

export class FraudService {
  async checkRequestVelocity(userId: string, ip: string): Promise<FraudCheckResult> {
    // Per-minute rate limit
    const key = `rate:${userId}:rpm`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, 60);
    if (count > 20) {
      await this.logEvent({ userId, type: "HIGH_REQUEST_VELOCITY",
        severity: "medium", details: { count, ip }, ip });
      return { allowed: false, reason: "RATE_LIMIT_EXCEEDED" };
    }
    // Multi-IP detection
    const ipKey = `user:${userId}:ips:${today()}`;
    await this.redis.sadd(ipKey, ip);
    await this.redis.expire(ipKey, 86400);
    if (await this.redis.scard(ipKey) > 5)
      await this.logEvent({ userId, type: "MULTIPLE_IPS", severity: "low",
        details: { ip }, ip });
    // Multi-account from same IP
    const userIpKey = `ip:${ip}:users:${today()}`;
    await this.redis.sadd(userIpKey, userId);
    await this.redis.expire(userIpKey, 86400);
    if (await this.redis.scard(userIpKey) > 3)
      await this.logEvent({ userId, type: "SHARED_IP_MULTI_ACCOUNT",
        severity: "high", details: { ip }, ip });
    return { allowed: true };
  }

  async checkRedeemAttempt(userId: string, ip: string): Promise<FraudCheckResult> {
    const hourKey = `redeem:${userId}:hour`;
    const count = await this.redis.incr(hourKey);
    await this.redis.expire(hourKey, 3600);
    if (count > 5) {
      await this.logEvent({ userId, type: "REDEEM_BRUTE_FORCE",
        severity: "high", details: { count, ip }, ip });
      return { allowed: false, reason: "TOO_MANY_REDEEM_ATTEMPTS" };
    }
    return { allowed: true };
  }

  async checkSpendVelocity(userId: string, microCredits: number): Promise<void> {
    const key = `spend:${userId}:hour`;
    const total = await this.redis.incrby(key, microCredits);
    await this.redis.expire(key, 3600);
    if (total > 1_000_000_000) { // 1000 credits in 1 hour
      await this.logEvent({ userId, type: "HIGH_SPEND_VELOCITY",
        severity: "critical", details: { total } });
      await this.alertAdmin(`🚨 High spend: User ${userId} spent ${total} micro-credits/hour`);
    }
  }

  private async logEvent(event: FraudEventInput): Promise<void> {
    await this.db.insert(fraudEvents).values({ ...event, createdAt: new Date() });
    if (event.severity === "critical") {
      await this.db.update(users)
        .set({ isFraudFlagged: true, fraudReason: event.type })
        .where(eq(users.id, event.userId));
    }
  }

  private async alertAdmin(message: string): Promise<void> {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message }) }
    ).catch(console.error);
  }
}
```

### 8.3 Code Generation with Checksum (Brute-Force Resistant)

```typescript
// Format: XXXX-XXXX-XXXX-CHCK  (last segment is checksum)
// Eliminates ~97% of brute-force attempts before hitting the DB

function generateCode(): string {
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I/L
  const seg = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)))
         .map(b => CHARS[b % CHARS.length]).join("");

  const body = `${seg(4)}-${seg(4)}-${seg(4)}`;
  const checksum = createHash("sha256")
    .update(body + process.env.CODE_SALT!)
    .digest("hex").slice(0, 4).toUpperCase();

  return `${body}-${checksum}`;
}

function validateCodeFormat(code: string): boolean {
  const parts = code.toUpperCase().trim().split("-");
  if (parts.length !== 4 || !parts.every(p => p.length === 4)) return false;
  const body = parts.slice(0, 3).join("-");
  const expected = createHash("sha256")
    .update(body + process.env.CODE_SALT!)
    .digest("hex").slice(0, 4).toUpperCase();
  return parts[3] === expected; // False = invalid format, don't hit DB
}
```

---

## Phase 9 — Billing, Token Ledger & Redeem System

### 9.1 Credit Unit System

```
UNIT DESIGN: Integer micro-credits (avoids ALL floating point errors)
  1 credit displayed to user = 1,000,000 micro-credits in DB
  0.001 USD per credit (you set this rate)

EXAMPLE — GPT-4o request (1000 input + 500 output tokens):
  Wholesale: (1k/1M * $5.00) + (0.5k/1M * $15.00) = $0.0125
  2x markup: $0.025
  In credits: $0.025 / $0.001 = 25 credits
  Stored as:  -25,000,000 micro-credits

REDEEM CODE EXAMPLE — 10 SAR card:
  10 SAR ≈ $2.67 USD
  At $0.001/credit: 2,670 credits
  Stored as:        2,670,000,000 micro-credits
```

### 9.2 Atomic Balance Operations

```typescript
// DEDUCTION — race-safe, cannot go below zero
export async function deductCreditsAtomic(
  userId: string, microCredits: number, description: string, metadata: UsageMetadata
): Promise<{ success: boolean; newBalance: number }> {

  return await db.transaction(async (tx) => {
    const updated = await tx.update(balances)
      .set({ credits: sql`credits - ${microCredits}`,
             totalSpent: sql`total_spent + ${microCredits}`,
             updatedAt: new Date() })
      .where(and(eq(balances.userId, userId), gte(balances.credits, microCredits)))
      .returning({ credits: balances.credits });

    if (updated.length === 0) return { success: false, newBalance: 0 };

    await tx.insert(transactions).values({
      userId, type: "usage_debit",
      amount: -microCredits, balanceAfter: updated[0].credits,
      description, ...metadata,
    });

    return { success: true, newBalance: updated[0].credits };
  });
}

// CREDIT — for redeems, admin grants, payments
export async function creditBalance(
  userId: string, microCredits: number, type: TxType, metadata: Record<string, unknown>
): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx.update(balances)
      .set({ credits: sql`credits + ${microCredits}`,
             totalRedeemed: sql`total_redeemed + ${microCredits}`,
             updatedAt: new Date() })
      .where(eq(balances.userId, userId))
      .returning({ credits: balances.credits });

    await tx.insert(transactions).values({
      userId, type, amount: microCredits,
      balanceAfter: updated[0].credits, ...metadata,
    });
  });
}
```

### 9.3 Redeem Service (Race-Safe)

```typescript
export async function redeemCode(
  userId: string, rawCode: string, ip: string
): Promise<RedeemResult> {

  const code = rawCode.toUpperCase().trim();

  // 1. Format check (no DB hit needed if invalid)
  if (!validateCodeFormat(code))
    return { success: false, error: "INVALID_FORMAT",
             message: "صيغة الكود غير صحيحة. تحقق من الكود وأعد المحاولة." };

  // 2. Fraud check
  const fraudCheck = await fraudService.checkRedeemAttempt(userId, ip);
  if (!fraudCheck.allowed)
    return { success: false, error: fraudCheck.reason,
             message: "تجاوزت عدد المحاولات المسموح بها. حاول بعد ساعة." };

  // 3. Atomic claim
  return await db.transaction(async (tx) => {
    const claimed = await tx.update(redeemCodes)
      .set({ status: "used", usedByUserId: userId, usedAt: new Date() })
      .where(and(
        eq(redeemCodes.code, code),
        eq(redeemCodes.status, "unused"),
        or(isNull(redeemCodes.expiresAt), gt(redeemCodes.expiresAt, new Date()))
      ))
      .returning();

    if (claimed.length === 0) {
      // Determine why for helpful error
      const existing = await tx.select({ status: redeemCodes.status, expiresAt: redeemCodes.expiresAt })
        .from(redeemCodes).where(eq(redeemCodes.code, code)).limit(1);
      if (!existing.length)          return { success: false, error: "NOT_FOUND",    message: "الكود غير موجود." };
      if (existing[0].status === "used")    return { success: false, error: "ALREADY_USED", message: "تم استخدام هذا الكود مسبقاً." };
      if (existing[0].status === "revoked") return { success: false, error: "REVOKED",      message: "هذا الكود ملغي." };
      if (existing[0].expiresAt && existing[0].expiresAt < new Date())
                                     return { success: false, error: "EXPIRED",      message: "انتهت صلاحية هذا الكود." };
      return { success: false, error: "INVALID", message: "الكود غير صالح." };
    }

    const { creditAmount, id: codeId } = claimed[0];
    await creditBalance(userId, creditAmount, "redeem",
      { description: `استبدال كود: ${code}`, redeemCodeId: codeId });

    return { success: true, creditsAdded: creditAmount,
             message: `تم إضافة ${formatCredits(creditAmount)} رصيد بنجاح! 🎉` };
  });
}
```

### 9.4 Bulk Code Generator CLI

```typescript
// infra/scripts/generate-codes.ts
// Usage: pnpm tsx generate-codes.ts --count=100 --value=50 --batch="Eid2026" --expires=2026-12-31

const args = parseArgs(process.argv.slice(2));
const batchId = crypto.randomUUID();
const codes = Array.from({ length: Number(args.count || 10) }, () => ({
  id:           crypto.randomUUID(),
  code:         generateCode(),
  creditAmount: Number(args.value || 50) * 1_000_000,
  faceValue:    args.facevalue || `${args.value} رصيد`,
  status:       "unused" as const,
  batchId,
  batchLabel:   args.batch || `batch-${Date.now()}`,
  expiresAt:    args.expires ? new Date(args.expires) : null,
}));

await db.insert(redeemCodes).values(codes);
console.log(`Generated ${codes.length} codes for batch: ${args.batch}`);
codes.forEach(c => console.log(c.code));

// Export CSV
const csv = ["Code,Value,Expires", ...codes.map(c =>
  `${c.code},${args.value},${args.expires || "never"}`)].join("\n");
writeFileSync(`${args.batch}-codes.csv`, csv);
console.log(`Saved to ${args.batch}-codes.csv`);
process.exit(0);
```

---

## Phase 10 — Background Jobs & Queue System

```typescript
// All jobs registered with BullMQ, backed by Redis

TRIGGERED JOBS (on-demand):
  sendEmail          → verification, welcome, low balance, receipts
  saveMessage        → persist message after stream (non-blocking)
  sendAdminAlert     → fraud events, errors, provider outages
  processPayment     → webhook-triggered balance credit

SCHEDULED JOBS (cron):
  pruneOldData       → 3 AM daily: delete old logs, archive old convos
  diskSpaceCheck     → Every hour: alert if > 80% full
  syncProviderPrices → Monday 9 AM: prompt to verify prices not changed
  weeklyReport       → Monday 8 AM: revenue, costs, margin, users report
  lowBalanceWarnings → Daily 10 AM: email users with < 10 credits
  providerBalanceCheck → Every 4 hours: check AI provider account balances
  backupDatabase     → 2 AM daily: pg_dump + compress + store + verify
  expireOldCodes     → 1 AM daily: mark expired codes

JOB QUEUE SETUP:
  All jobs in Redis DB 1 (separate from sessions in DB 0)
  Failed jobs retry: 3 times with exponential backoff
  Dead letter queue: failed jobs kept 7 days for debugging
  Concurrency: email=5, saveMessage=20, alerts=2
```

---

## Phase 11 — Email & Notification System

### 11.1 Email Templates (Arabic RTL)

```typescript
// All built with React Email, RTL-aware layout

EMAIL_TEMPLATES = {
  verification:   Subject: "تأكيد البريد الإلكتروني"
  welcome:        Subject: "مرحباً في {appName} 👋"
  firstRedeem:    Subject: "تم شحن رصيدك بنجاح ✅"
  lowBalance:     Subject: "⚠️ رصيدك منخفض — {credits} رصيد متبقٍ"
  paymentReceipt: Subject: "إيصال الدفع — {amount} {currency}"
  suspended:      Subject: "تم تعليق حسابك مؤقتاً"
  passwordReset:  Subject: "إعادة تعيين كلمة المرور"
  weeklyReport:   Subject: "📊 تقرير المنصة الأسبوعي"
}

// Key email rules:
// - All emails have dir="rtl" in the HTML tag
// - IBM Plex Arabic font embedded
// - Primary CTA button is right-aligned
// - Unsubscribe link in footer (legal requirement in many countries)
// - Sent via Resend, FROM your domain (not noreply@resend.dev)
// - SPF + DKIM + DMARC records set up before launch
```

### 11.2 Telegram Admin Alerts

```
Alert triggers and their Telegram message format:

CRITICAL (immediate):
  🚨 FRAUD: User {email} auto-suspended — HIGH_SPEND_VELOCITY
  🚨 PROVIDER: All Claude channels failed (error rate 100%)
  🚨 DISK: Server disk 90% full — immediate action required
  🚨 DB: PostgreSQL connection pool exhausted

WARNING (grouped, max 1/10min):
  ⚠️ PROVIDER: OpenAI P95 latency > 30s
  ⚠️ BALANCE: Your Anthropic API account balance < $50
  ⚠️ DISK: Server disk 80% full

INFO (daily digest):
  💰 Today: 2,450 SAR revenue | 580 SAR costs | 76% margin
  👤 New users today: 12 | Active: 847
```

---

## Phase 12 — Frontend Architecture & Design System

### 12.1 Design Tokens

```
COLORS (Dark mode primary):
  bg-base:     #0F172A  (slate-950)
  bg-surface:  #1E293B  (slate-800)
  bg-elevated: #334155  (slate-700)
  border:      #475569  (slate-600)
  text-primary:   #F8FAFC
  text-secondary: #94A3B8
  text-muted:     #64748B
  accent-blue:  #2563EB
  accent-teal:  #0F766E
  error:        #EF4444
  warning:      #F59E0B
  success:      #10B981

TYPOGRAPHY:
  Arabic: IBM Plex Arabic (300/400/500/600/700)
  Latin:  Inter (400/500/600)
  Code:   JetBrains Mono (400/500)
  Scale:  12/14/16/18/20/24/32/48px

RTL RULES:
  Use logical CSS properties everywhere (no left/right, use start/end)
  Sidebar: right side in RTL, left side in LTR
  Send button: left of input in RTL (natural text flow)
  Code blocks: always LTR regardless of document direction
  Timestamps: align to reading end (left in RTL)
```

---

## Phase 13 — Arabic RTL & Full Localization

### 13.1 Layout Setup

```typescript
// apps/web/app/[locale]/layout.tsx
export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  const isRTL = locale === "ar";
  return (
    <html lang={locale} dir={isRTL ? "rtl" : "ltr"}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@300;400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className={cn("bg-slate-950 text-slate-50 antialiased",
        isRTL ? "font-arabic" : "font-inter")}>
        <NextIntlClientProvider locale={locale} messages={await import(`../../messages/${locale}.json`)}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

```css
/* RTL Critical CSS */

/* Code blocks always LTR */
pre, code, .code-block {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}

/* Mixed Arabic + code content */
p, .message-content { unicode-bidi: plaintext; }

/* RTL-aware slide animations */
@keyframes slideIn    { from { translate: -100% 0; } to { translate: 0 0; } }
@keyframes slideInRTL { from { translate:  100% 0; } to { translate: 0 0; } }
[dir="rtl"] .slide-in { animation-name: slideInRTL; }
```

### 13.2 Arabic Translation File (Complete)

```json
{
  "app": { "name": "منصة الذكاء", "tagline": "ذكاء اصطناعي متقدم بسعر في متناول الجميع" },
  "nav": {
    "chat": "المحادثة", "billing": "الرصيد والشحن",
    "settings": "الإعدادات", "admin": "لوحة الإدارة", "logout": "تسجيل الخروج"
  },
  "chat": {
    "newChat": "محادثة جديدة", "placeholder": "اكتب رسالتك...",
    "send": "إرسال", "stop": "إيقاف", "regenerate": "إعادة المحاولة",
    "copy": "نسخ", "copied": "تم النسخ ✓", "thinking": "جارٍ التفكير...",
    "selectModel": "اختر النموذج", "today": "اليوم", "yesterday": "أمس",
    "thisWeek": "هذا الأسبوع", "older": "أقدم",
    "contextWarning": "اقتربت من حد السياق لهذا النموذج",
    "contextExceeded": "رسالتك أطول من الحد المسموح. قلّل الرسالة أو اختر نموذجاً بسياق أوسع."
  },
  "balance": {
    "current": "رصيدك", "unit": "رصيد", "addCredits": "شحن الرصيد",
    "low": "رصيد منخفض",
    "lowMessage": "لديك {amount} رصيد فقط. اشحن الآن لتجنب الانقطاع.",
    "zero": "رصيد صفر", "zeroMessage": "انتهى رصيدك. اشحن حسابك للمتابعة.",
    "history": "سجل المعاملات", "noHistory": "لا توجد معاملات بعد"
  },
  "redeem": {
    "title": "استبدال كود الشحن",
    "placeholder": "مثال: XXXX-XXXX-XXXX-XXXX",
    "button": "استبدال", "loading": "جارٍ التحقق...",
    "success": "تم إضافة {amount} رصيد بنجاح! 🎉",
    "errors": {
      "INVALID_FORMAT": "صيغة الكود غير صحيحة. تحقق وأعد المحاولة.",
      "NOT_FOUND": "هذا الكود غير موجود.",
      "ALREADY_USED": "تم استخدام هذا الكود مسبقاً.",
      "EXPIRED": "انتهت صلاحية هذا الكود.",
      "REVOKED": "هذا الكود ملغي. تواصل مع الدعم.",
      "TOO_MANY_ATTEMPTS": "تجاوزت عدد المحاولات. حاول بعد ساعة.",
      "GENERIC": "حدث خطأ. حاول مرة أخرى أو تواصل مع الدعم."
    }
  },
  "auth": {
    "login": "تسجيل الدخول", "register": "إنشاء حساب",
    "email": "البريد الإلكتروني", "password": "كلمة المرور",
    "confirmPassword": "تأكيد كلمة المرور",
    "forgotPassword": "نسيت كلمة المرور؟",
    "loginButton": "دخول", "registerButton": "إنشاء حساب",
    "haveAccount": "لديك حساب؟", "noAccount": "ليس لديك حساب؟",
    "verifyEmail": "تأكيد البريد الإلكتروني",
    "verifyMessage": "أرسلنا رابط تأكيد إلى {email}."
  },
  "errors": {
    "generic": "حدث خطأ. يرجى المحاولة مرة أخرى.",
    "network": "خطأ في الاتصال. تحقق من الإنترنت.",
    "rateLimit": "تجاوزت الحد المسموح. انتظر قليلاً.",
    "sessionExpired": "انتهت جلستك. سجّل الدخول مجدداً.",
    "modelUnavailable": "هذا النموذج غير متاح. جرّب نموذجاً آخر.",
    "streamInterrupted": "انقطع الاتصال أثناء الاستجابة. يمكنك إعادة المحاولة."
  }
}
```

---

## Phase 14 — Chat Interface & Edge Cases

### 14.1 All Edge Cases Handled

```typescript
// EDGE CASE 1: Insufficient balance
onError: (err) => {
  if (err.includes("INSUFFICIENT_BALANCE")) showBalanceModal();
}

// EDGE CASE 2: Context window exceeded — warn BEFORE sending
const tokenEstimate = Math.ceil(inputText.length / 4) + conversationTokens;
const isOverLimit = tokenEstimate > model.contextWindow * 0.95;
// Disable send button, show Arabic warning

// EDGE CASE 3: Session expired mid-conversation
// Save current URL to sessionStorage, redirect to login, restore after

// EDGE CASE 4: Same conversation in 2 browser tabs
// BroadcastChannel API — warn user about potential message conflicts

// EDGE CASE 5: Very long AI responses with code
// react-window VariableSizeList — only render visible messages
// Lazy code highlighting: skip for code blocks > 500 lines

// EDGE CASE 6: Network offline detection
window.addEventListener("offline", () => showOfflineBanner());

// EDGE CASE 7: Stream interrupted halfway
// isPartial flag saved with message
// Show: "⚠️ الاستجابة منقطعة — اضغط لإعادة المحاولة"
// Only bill for tokens actually received

// EDGE CASE 8: Zero balance after stream starts
// Stream continues (already paid), but next message will be blocked

// EDGE CASE 9: Model becomes unavailable during session
// Detect from error response, auto-suggest next available model

// EDGE CASE 10: Arabic text + code block in same message
// unicode-bidi: plaintext on message content
// Explicit dir="ltr" on all code blocks
```

### 14.2 Local Conversation Cache (IndexedDB)

```typescript
// Conversations cached locally — instant load, sync in background
import { get, set } from "idb-keyval";

export function useLocalConversation(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // 1. Serve from IndexedDB immediately (zero latency)
    get(`conv_${conversationId}`).then(cached => { if (cached) setMessages(cached); });
    // 2. Sync from server (updates if needed)
    fetchConversation(conversationId).then(serverMessages => {
      setMessages(serverMessages);
      set(`conv_${conversationId}`, serverMessages);
    });
  }, [conversationId]);

  const appendMessage = async (message: Message) => {
    const updated = [...messages, message];
    setMessages(updated);
    await set(`conv_${conversationId}`, updated); // Instant local save
  };

  return { messages, appendMessage };
}
```

---

## Phase 15 — Billing UI & Payment Flows

```typescript
// /ar/billing page structure

SECTIONS:
1. Balance Hero (top, prominent)
   Current balance in large numbers
   Estimated USD equivalent
   "شحن الرصيد" CTA button

2. Redeem Code Section
   Large input field (easy to type on mobile)
   Paste button
   Instant validation with checksum (before hitting server)
   Success animation on redeem

3. Pricing Table (transparency builds trust)
   Model name | Input cost/1k tokens | Output cost/1k tokens | Tier badge
   Users understand what they're spending

4. Transaction History
   Last 50 transactions (paginated)
   Type badge: redeem (green), usage (blue), admin (purple)
   Model name, token counts, credit amount
   Export CSV button

5. Future: Payment packages
   "50 SAR → 2,670 رصيد"
   "100 SAR → 5,500 رصيد (bonus 10%)"
   Pay with Mada / Apple Pay / VISA
```

---

## Phase 16 — Admin Dashboard

### 16.1 All Admin Pages

```
/admin/dashboard
  KPIs (24h / 7d / 30d): Revenue | API Costs | Gross Margin % | Active Users
  Charts: Revenue vs Cost | Requests by model | New users | Channel health
  Live: Last 20 transactions | Active streams | Provider status

/admin/users
  Search by email | Filter by status/tier
  Quick actions: add credits, suspend, reset password
  User detail: transactions, conversations, IPs, fraud events

/admin/codes
  Stats: total codes | redeemed % | expired unclaimed
  Batch list with status breakdown
  Generate batch: count, value, label, expiry
  Export CSV | Printable PDF cards
  Revoke individual code or entire batch

/admin/channels
  Real-time health: latency, error rate, requests/min
  Enable/disable channels instantly
  Add/edit channel: provider, key, models, priority

/admin/fraud
  Unresolved events (newest first)
  Severity filter: critical → low
  Actions: resolve, suspend user, clear flag, IP ban
  IP lookup: all accounts from an IP

/admin/models
  Toggle availability (instant)
  Edit display name (AR + EN), badge, markup multiplier
  Usage stats per model: requests, tokens, revenue

/admin/logs
  Real-time log stream
  Filter: user, model, status, date
  Slow request analysis (p95, p99)
  Export CSV

/admin/settings
  Platform name (AR + EN)
  Logo upload
  Maintenance mode toggle
  Welcome bonus credits (0 = disabled)
  Support contact link
```

---

## Phase 17 — User Settings & API Access

```
/settings page sections:

PROFILE
  Display name (editable)
  Email (read-only, change requires verification)
  Avatar upload

SECURITY
  Change password (current + new + confirm)
  Two-factor authentication (TOTP via authenticator app)
  Active sessions list with logout option
  "Logout all devices" button

PREFERENCES
  Language: العربية / English
  Default model
  Theme: (dark only for now, light in roadmap)

API ACCESS (for developers)
  Description: "استخدم منصتنا من تطبيقاتك عبر API متوافق مع OpenAI"
  Generate API key button
  Key shown ONCE after generation (copy prompt)
  Prefix shown: "sk-aip-xxxx..."
  Revoke key button
  Link to API documentation
  Usage stats for the key

DATA & PRIVACY
  Export all conversations (JSON)
  Delete account (requires password confirmation)
  "ستُحذف جميع بياناتك خلال 30 يوماً"
```

---

## Phase 18 — Observability, Monitoring & Alerting

### 18.1 Prometheus Metrics

```
BUSINESS METRICS:
  aip_credits_spent_total{model, tier}        Revenue tracker
  aip_credits_redeemed_total{}                Sales volume
  aip_active_users_gauge{}                    5-min active count
  aip_provider_cost_usd_total{provider}       Your actual costs
  aip_gross_margin_percent{}                  Business health

TECHNICAL METRICS:
  aip_http_request_duration_seconds{route,status}  API latency histogram
  aip_upstream_duration_seconds{provider}          Provider latency
  aip_upstream_error_rate{provider,model}          Provider reliability
  aip_streaming_connections_active{}               Live streams
  aip_balance_deduction_failures_total{}           Billing errors
  aip_fraud_events_total{type,severity}            Security events
  aip_queue_job_duration_seconds{job}              Job performance

INFRASTRUCTURE:
  Container memory/CPU | Disk space | DB connections | Redis memory
```

### 18.2 Grafana Dashboards

```
Dashboard 1: Operations Overview
  Active users | Active streams | Error rate | Uptime
  Request rate over time | P95 latency over time
  Provider health table | Recent errors

Dashboard 2: Business / Revenue
  Revenue today | MTD | Gross margin | New users
  Revenue vs Cost chart | Model usage breakdown
  Top users by spend | Redeem activity

Dashboard 3: Provider Health
  Per provider: latency histogram | error rate | volume
  Channel failover timeline | Model availability heatmap

Dashboard 4: Security / Fraud
  Fraud events by type | Rate limit hits | Suspended accounts
  IP analysis | Redeem attempt failures

Dashboard 5: Infrastructure
  CPU/RAM per container | Disk usage + projection
  PostgreSQL: connections, query times, table sizes
  Redis: memory, hit rate, queue depths
```

### 18.3 Alert Rules

```yaml
# CRITICAL (Telegram + email, immediate)
- Provider all channels failed → error_rate > 50% for 2m
- Balance deductions failing   → any failure for 1m
- Disk space critical          → free < 15%
- DB connections exhausted     → count > 90 for 2m

# WARNING (email, max once per 10min)
- Provider high latency         → P95 > 30s for 5m
- Application error rate > 5%  → for 5m
- Disk space warning            → free < 25%
- Provider API balance low      → balance < $50
```

---

## Phase 19 — DevOps, CI/CD & Zero-Downtime Deployment

### 19.1 Full docker-compose.yml

```yaml
name: ai-platform

services:
  caddy: