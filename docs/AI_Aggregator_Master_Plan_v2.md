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
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [web, api]

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped
    env_file: .env
    depends_on: [api]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    restart: unless-stopped
    env_file: .env
    depends_on: [postgres, valkey]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  gateway:
    image: newapi/new-api:latest        # "New API" — Go provider gateway
    restart: unless-stopped
    env_file: .env
    volumes: ["gateway_data:/data"]
    depends_on: [postgres, valkey]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./infra/scripts/backup.sh:/backup.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped
    command: valkey-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes: ["valkey_data:/data"]
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes: ["minio_data:/data"]

  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    volumes:
      - ./infra/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus

  loki:
    image: grafana/loki:latest
    restart: unless-stopped
    volumes: ["loki_data:/loki"]

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./infra/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    depends_on: [prometheus, loki]

  gatus:
    image: twin/gatus:latest
    restart: unless-stopped
    volumes: ["./infra/gatus.yml:/config/config.yaml:ro"]

volumes:
  pg_data:
  valkey_data:
  minio_data:
  gateway_data:
  prometheus_data:
  loki_data:
  grafana_data:
  caddy_data:
  caddy_config:
```

### 19.2 GitHub Actions — Test, Build, Deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm type-check
      - run: pnpm lint
      - run: pnpm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/ai-platform
            git pull origin main
            docker compose build --pull
            docker compose up -d --remove-orphans
            docker image prune -f
      - name: Post-deploy health check
        run: |
          sleep 15
          curl -f "https://chat.${{ secrets.DOMAIN }}/api/health" || exit 1
          curl -f "https://api.${{ secrets.DOMAIN }}/health" || exit 1
      - name: Notify on failure
        if: failure()
        run: |
          curl -s -X POST \
            "https://api.telegram.org/bot${{ secrets.TELEGRAM_BOT_TOKEN }}/sendMessage" \
            -d "chat_id=${{ secrets.TELEGRAM_CHAT_ID }}" \
            -d "text=🚨 Deploy FAILED — check GitHub Actions"
```

### 19.3 Zero-Downtime Rollout Strategy

```
BUILD-FIRST, SWAP-AFTER (single-VPS friendly — no orchestrator needed):

1. `docker compose build` runs BEFORE `up -d` — new images are ready
   before any container is touched.
2. `docker compose up -d` recreates only containers whose image/config
   changed. Postgres/Valkey/MinIO stay untouched and running.
3. Fastify's healthcheck must pass before Caddy routes traffic to it —
   Docker's `depends_on: condition: service_healthy` (add this once you
   have >1 replica) prevents a half-booted container taking requests.
4. DATABASE MIGRATIONS RUN SEPARATELY, BEFORE THE SWAP:
     pnpm --filter @ai-platform/db db:migrate
   Never run migrations inside the app's boot sequence — a crashed
   migration should never block container start, and you want to see
   its output distinctly from app logs.
5. BACKWARD-COMPATIBLE MIGRATIONS ONLY:
     Adding a column: safe, nullable or defaulted.
     Renaming a column: NEVER in one deploy — add new, dual-write,
     backfill, drop old column in a LATER deploy.
     Dropping a column: only after the code that reads it has been
     gone for at least one full deploy cycle.
6. ROLLBACK: `git revert`, push, let the pipeline redeploy the previous
   image. Keep the last 3 image tags on the VPS (`docker image prune`
   with a keep-count, not `-a`) so a rollback doesn't require a rebuild.
```

---

## Phase 20 — Incident Runbooks & Operational Playbooks

### 20.1 Provider Outage (`docs/runbooks/provider-outage.md`)

```
SYMPTOM: aip_upstream_error_rate{provider} > 50%, Grafana alert fired.

1. Check the provider's public status page (fastest signal).
2. In /admin/channels, confirm failover triggered — traffic should already
   be routing to the backup channel. If it did, this is a P2, not a P1:
   users are unaffected, monitor and wait for the primary to recover.
3. If ALL channels for a model are down:
   a. Disable that model in /admin/models (prevents new chats from
      selecting it — existing conversations get a graceful error instead
      of hanging).
   b. Post a status update on the status page: "نموذج [X] غير متاح مؤقتاً"
   c. If it's your only/primary model, this is P1 — notify users via
      banner (StatusBanner.tsx) that the platform is degraded.
4. Once the provider recovers, re-enable in /admin/models, monitor error
   rate for 10 minutes before declaring resolved.
5. Post-incident: log start/end time, root cause, user-facing impact in
   the incident log for the weekly report.
```

### 20.2 Database Full (`docs/runbooks/database-full.md`)

```
SYMPTOM: Disk space alert, free < 15%.

1. SSH in, check what's actually large:
     du -sh /var/lib/docker/volumes/*/  | sort -rh | head -10
2. Usual suspects, in order of likelihood:
   a. Postgres WAL bloat from a stuck replication slot or long transaction
        → docker compose exec postgres psql -U $POSTGRES_USER -c \
            "SELECT * FROM pg_stat_replication;"
   b. Docker log files (should be capped by daemon.json, verify it applied)
        → docker compose logs --no-log-prefix api | wc -l
   c. Loki retention not pruning
        → check loki config retention_period is actually set
   d. audit_logs / old conversations not being pruned
        → pg_cron job silently failing, check cron.job_run_details
3. IMMEDIATE relief if critical (<5% free):
     docker system prune -af --volumes=false   (never touch named volumes blindly)
     Manually run the retention SQL from Phase 5.3 if pg_cron missed a run.
4. Once stable, fix root cause — don't just free space and move on.
```

### 20.3 High Error Rate (`docs/runbooks/high-error-rate.md`)

```
SYMPTOM: Application error rate > 5% for 5 minutes.

1. Grafana → Operations Overview → "Recent errors" panel — read the
   actual error, don't guess.
2. Common causes ranked by frequency:
   a. A provider degraded but failover misconfigured → check Phase 20.1
   b. A bad deploy went out → check deploy timestamp vs error spike onset.
      If they line up: ROLLBACK FIRST, investigate after. Don't debug in
      prod while users are affected.
   c. DB connection pool exhausted → check aip DB connections metric,
      restart api container to release stuck connections as a stopgap.
   d. Redis down/unreachable → rate limiting and sessions both fail;
      check `docker compose ps valkey`.
3. If rollback doesn't fix it, it's not the last deploy — check
   infrastructure (disk, DB, provider) before touching code further.
```

### 20.4 Fraud Detected (`docs/runbooks/fraud-detected.md`)

```
SYMPTOM: fraud_events_total{severity="critical"} fired, Telegram alert.

1. /admin/fraud → find the event, read `details` JSONB for context.
2. If auto-suspended (critical severity does this automatically):
   user is already blocked from spending further — no urgency to act
   within minutes, but review within the hour.
3. Check /admin/users/[id] for that user:
   - Transaction history: does the spend pattern look automated
     (identical amounts, sub-second intervals)?
   - IP history: single IP, VPN range, or shared with other flagged users?
4. Decision tree:
   - Clearly automated abuse → keep suspended, ban the API key, consider
     IP-range block if pattern repeats across accounts.
   - Legitimate power user tripped a threshold → clear the flag, consider
     raising their rate limit tier, apologize via support if they contacted you.
   - Ambiguous → keep suspended, email user asking them to verify account
     activity before reinstating.
5. If it's a coordinated multi-account pattern (SHARED_IP_MULTI_ACCOUNT
   firing across several users at once): treat as P1, this scales fast.
   Suspend the whole IP's accounts, investigate the redeem-code batch
   they used (leaked codes are the most common vector).
```

### 20.5 Deploy Rollback (`docs/runbooks/deploy-rollback.md`)

```
1. Identify the last known-good commit SHA (check GitHub Actions history
   for the last green deploy).
2. git revert <bad-commit> --no-edit  (or git reset if it's the tip and
   unpushed elsewhere — prefer revert on shared branches)
3. git push origin main → pipeline redeploys automatically.
4. If the bad deploy included a migration that's already been applied
   and is NOT backward compatible: this is why 19.3's rule about
   backward-compatible migrations only exists. You cannot cleanly roll
   back a destructive migration by reverting code — you need a
   forward-fix migration instead. Write it, don't try to un-migrate.
5. Verify with the same health checks from 19.2's post-deploy step
   before considering it resolved.
```

---

## Phase 21 — Status Page & User Communication

```
GATUS CONFIG (infra/gatus.yml):

endpoints:
  - name: "واجهة الدردشة"
    url: "https://chat.domain.com/api/health"
    interval: 30s
    conditions: ["[STATUS] == 200", "[RESPONSE_TIME] < 2000"]

  - name: "بوابة API"
    url: "https://api.domain.com/health"
    interval: 30s
    conditions: ["[STATUS] == 200"]

  - name: "OpenAI"
    url: "https://status.openai.com/api/v2/status.json"
    interval: 60s
    conditions: ["[STATUS] == 200"]

  - name: "Anthropic"
    url: "https://status.anthropic.com/api/v2/status.json"
    interval: 60s
    conditions: ["[STATUS] == 200"]

INCIDENT COMMUNICATION TEMPLATES (bilingual, prewritten so you're not
composing under pressure):

  Investigating:
    AR: "نحن نحقق في مشكلة تؤثر على [الخدمة]. سنقوم بتحديثكم قريباً."
    EN: "We're investigating an issue affecting [service]. Updates soon."

  Identified:
    AR: "تم تحديد سبب المشكلة في [الخدمة]. نعمل على الإصلاح الآن."
    EN: "We've identified the cause affecting [service] and are working on a fix."

  Resolved:
    AR: "تم حل المشكلة بالكامل. نعتذر عن الإزعاج."
    EN: "The issue has been fully resolved. We apologize for the inconvenience."

IN-APP BANNER (StatusBanner.tsx):
  Shown when Gatus reports any endpoint down for > 2 minutes.
  Dismissible per-session, reappears on next page load until resolved.
  Links to the public status page for details.
```

---

## Phase 22 — Business Logic & Pricing Engine

### 22.1 Markup Strategy

```
DEFAULT MARKUP: 2x wholesale cost (covers infra, payment fees, margin)

PER-MODEL OVERRIDE (models.config.ts):
  Budget models (DeepSeek, GPT-4o-mini): 1.8x — compete on price
  Flagship models (Claude Opus, GPT-4o): 2.2x — users pay for quality
  New/promotional models: 1.5x temporarily to drive trial

TIER-BASED ADJUSTMENTS:
  free:     Access to budget models only, hard monthly cap
  standard: Full catalog, standard markup
  premium:  Full catalog, priority queue on rate limits, 10% markup discount

MARGIN HEALTH CHECK (infra/scripts/price-audit.ts):
  Run weekly (cron) — refetches each provider's published pricing page,
  diffs against provider_prices table. Providers change prices with
  little notice; a stale price = silent margin erosion or a config that
  suddenly undercharges. Alert admin on any diff > 5%.
```

### 22.2 Pricing Calculation

```typescript
// packages/config/src/models.config.ts (excerpt)
export function calculateCreditCost(
  modelId: string, inputTokens: number, outputTokens: number
): number {
  const price = getCurrentPrice(modelId);      // from provider_prices, effectiveTo IS NULL
  const model = MODEL_CATALOG.find(m => m.id === modelId)!;

  const wholesaleUsd =
    (inputTokens  / 1000) * price.inputPriceUsd +
    (outputTokens / 1000) * price.outputPriceUsd;

  const markedUpUsd = wholesaleUsd * model.markupMultiplier;
  const microCredits = Math.ceil((markedUpUsd / MICRO_CREDIT.USD_PER_CREDIT) * 1_000_000);

  return microCredits;
}
```

### 22.3 Free Tier Limits

```
FREE TIER CAPS (prevents subsidizing abuse indefinitely):
  Welcome bonus: configurable in /admin/settings, default 50 credits
  Monthly free-tier top-up: 0 by default (credits-only, no recurring free)
  Model access: budget tier only (DeepSeek, GPT-4o-mini)
  Rate limit: same as paid (fraud protection, not a paid feature)

CONVERSION NUDGES:
  Balance < 10 credits → BalanceWidget turns amber, subtle CTA
  Balance = 0 → hard block on send, redirect to /billing with context
    ("رصيدك انتهى — اشحن الآن للمتابعة")
  First redeem → welcome-back email 3 days later if they haven't returned
```

---

## Phase 23 — Local Payment Gateway Integration

### 23.1 Provider Comparison (GCC-focused)

```
Moyasar (Saudi Arabia)
  Supports: Mada, Visa/Mastercard, Apple Pay, STC Pay
  Fees: ~2.5% + local Mada support (critical for KSA — most cards are Mada)
  Best for: Saudi-first launch

PayTabs (Pan-MENA)
  Supports: Mada, cards, Apple Pay, multiple currencies
  Fees: ~2.75%, broader MENA coverage than Moyasar
  Best for: Multi-country GCC expansion

Tap Payments (Bahrain/Kuwait/GCC)
  Supports: KNET (Kuwait), Benefit (Bahrain), cards, Apple Pay
  Best for: Gulf countries beyond Saudi

RECOMMENDATION: Start with Moyasar (Saudi-first, Mada is non-negotiable
for local trust), add Tap Payments if expanding to Kuwait/Bahrain.
```

### 23.2 Payment Flow

```typescript
// apps/web/app/api/webhooks/payment/route.ts

export async function POST(req: Request) {
  const signature = req.headers.get("x-moyasar-signature");
  const body = await req.text();

  if (!verifyMoyasarSignature(body, signature, process.env.MOYASAR_WEBHOOK_SECRET!)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);
  if (event.type !== "payment.paid") return new Response("OK", { status: 200 });

  const { id: paymentId, amount, metadata } = event.data;

  // IDEMPOTENCY: webhooks can and will be delivered more than once
  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.description, `moyasar:${paymentId}`),
  });
  if (existing) return new Response("Already processed", { status: 200 });

  const credits = sarToCredits(amount / 100); // Moyasar amounts are in halalas
  await creditBalance(metadata.userId, credits, "payment", {
    description: `moyasar:${paymentId}`,
  });

  await emailQueue.add("paymentReceipt", { userId: metadata.userId, amount, credits });
  return new Response("OK", { status: 200 });
}
```

### 23.3 Payment Package Tiers

```
"شحن الرصيد" packages (displayed with visible per-credit value):

  25 SAR  →  1,335 رصيد            (no bonus — entry tier)
  50 SAR  →  2,780 رصيد   (+4%)    (small loyalty nudge)
  100 SAR →  5,830 رصيد  (+10%)    (best-value badge)
  250 SAR → 15,010 رصيد  (+12%)    (power-user tier)

  Redeem codes remain available for gift cards / resellers / promos —
  this is the direct self-serve top-up path.
```

---

## Phase 24 — Growth Features

```
REFERRAL PROGRAM:
  Each user gets a referral code (users.referralCode, already in schema)
  Referrer gets 20 credits when referee makes their first redeem/payment
  Referee gets a 10% bonus on their first top-up
  Fraud guard: referrer and referee IP must differ (same-IP self-referral
  is the #1 way this gets abused)

USAGE-BASED RE-ENGAGEMENT:
  Inactive 14 days + balance > 0 → "نفتقدك! 🙌" email with a quick-start prompt
  Inactive 30 days + balance = 0 → small "welcome back" bonus (configurable,
  default 10 credits) to reduce churn cost of re-acquisition

MODEL DISCOVERY:
  "جديد 🆕" badge on models added in the last 14 days
  Model comparison view: side-by-side cost/speed/quality for common tasks
  Weekly digest email: "أفضل النماذج هذا الأسبوع" based on aggregate usage

API DEVELOPER GROWTH:
  Public API docs (OpenAI-compatible — near-zero migration cost for devs
  already building against OpenAI's SDK)
  Rate-limit-friendly free tier for API access specifically, separate cap
  from chat UI usage, to encourage integration experimentation
```

---

## Phase 25 — Scalability Roadmap

```
STAGE 1 — LAUNCH (0–200 users): current architecture
  Single VPS, all services in docker-compose, Hetzner CX22

STAGE 2 — GROWTH (200–2,000 users)
  Trigger: sustained CPU > 60% or DB connections > 70% of pool
  Move: Postgres → managed (Neon/Supabase) — removes backup/failover
        burden, adds read replicas when needed
  Move: Valkey → Upstash (serverless) — removes memory-sizing guesswork
  VPS becomes stateless: web + api + gateway only

STAGE 3 — SCALE (2,000–20,000 users)
  Trigger: single VPS CPU-bound even after stage 2 offload
  Horizontal: multiple api/web containers behind Caddy load balancing,
              health-check-gated (Phase 19.3's condition: service_healthy)
  Split: dedicated queue worker process, separate from the request-serving
         api process (background jobs stop competing with request latency)
  Add: CDN in front of MinIO/R2 for avatar/export delivery

STAGE 4 — MULTI-REGION (20,000+ users)
  Trigger: latency complaints from users outside your primary region
  Read replicas in-region, writes still centralized (billing needs
  strong consistency — do not shard balances across regions)
  Consider Cloudflare Workers/edge for static + auth-check fast paths

AT EVERY STAGE: the credit ledger (transactions table) and atomic balance
operations (Phase 9.2) do not change. That correctness guarantee is what
lets everything else around it scale independently.
```

---

## Security Hardening Master Checklist

```
SECRETS
[ ] All secrets in .env, never committed (verify with git log --all -- .env)
[ ] Different secrets per environment (dev/staging/prod never share keys)
[ ] BETTER_AUTH_SECRET, GATEWAY_MASTER_KEY, CODE_SALT: 32+ random bytes
[ ] Rotate provider API keys if any were ever pasted into chat/Slack/email

AUTH
[ ] Password hashing via Better Auth's own scrypt (never roll your own)
[ ] Session cookies: httpOnly, secure, sameSite=lax at minimum
[ ] Rate limiting on login/register/password-reset (Phase 8.1)
[ ] API keys hashed with SHA-256 for lookup (NOT bcrypt — bcrypt is
    salted/non-deterministic and cannot be queried by value; bcrypt is
    correct for passwords which are verified, not looked up)

DATABASE
[ ] credits >= 0 CHECK constraint (Phase 5.2) — last line of defense
    against a billing bug ever creating free money
[ ] Parameterized queries only (Drizzle handles this — never raw string
    interpolation into SQL)
[ ] Least-privilege DB user for the app (not the postgres superuser)
[ ] Automated encrypted backups, tested restore at least once before launch

NETWORK
[ ] Firewall: only 22/80/443 open (Phase 4.2)
[ ] fail2ban on SSH
[ ] Non-root SSH user, key-only auth, root login disabled
[ ] Internal services (postgres, valkey, minio) NOT exposed to the
    internet — only reachable within the Docker network

APPLICATION
[ ] CORS locked to your actual frontend origin, not "*"
[ ] Helmet/CSP headers on all HTTP responses
[ ] Input validation via Zod on every mutation, not just the obvious ones
[ ] Error messages to users never leak stack traces or internal paths
    (log full detail server-side, return generic message client-side)
[ ] Redeem codes: checksummed format (Phase 8.3) + rate limited + audit logged

COMPLIANCE
[ ] Terms of Service, Privacy Policy, Acceptable Use Policy live and linked
[ ] Data deletion actually deletes (test it — soft-delete flags that
    never get purged are a GDPR liability, not just a UX detail)
```

---

## Complete Build Order — Day by Day

```
WEEK 1 — FOUNDATION
  Day 1-2:  Phase 0 (legal docs drafted, entity registration started)
  Day 3:    Phase 1-3 (stack finalized, repo scaffolded, monorepo wired)
  Day 4-5:  Phase 4 (VPS provisioned, hardened, Docker installed)

WEEK 2 — DATA & AUTH
  Day 6-7:  Phase 5 (schema written, migrated, constraints/indexes in place)
  Day 8-9:  Phase 6 (Better Auth wired — INCLUDING account/verification
            tables and field-name mapping to your actual column names;
            do not assume the adapter "just works" with default config
            if your schema uses non-default field names — verify signup
            end-to-end before moving on)
  Day 10:   Auth end-to-end test: signup → verify email → login → session
            reaches a protected route. Do not proceed until this works.

WEEK 3 — CORE BACKEND
  Day 11-13: Phase 7 (gateway integration, streaming proxy, error mapping)
  Day 14-15: Phase 9 (billing engine, atomic deduction, redeem system)
  Day 16-17: Phase 8 (fraud rules wired into the request path, not bolted
             on after — retrofitting fraud checks is much harder)
  Day 18-19: Phase 10-11 (job queue, email templates)

WEEK 4 — FRONTEND
  Day 20-22: Phase 12-13 (design system, RTL, i18n scaffolding)
  Day 23-25: Phase 14 (chat interface — this is the product; give it time)
  Day 26-27: Phase 15, 17 (billing UI, settings/API access page)

WEEK 5 — ADMIN & OPS
  Day 28-30: Phase 16 (admin dashboard — you'll live in this daily)
  Day 31-32: Phase 18 (monitoring wired up BEFORE launch, not after)
  Day 33-34: Phase 19 (CI/CD, deploy pipeline tested with a real deploy)
  Day 35:    Phase 20-21 (runbooks written, status page live)

WEEK 6 — BUSINESS & LAUNCH PREP
  Day 36-37: Phase 22-23 (pricing finalized, payment gateway integrated
             and tested with real small-value transactions)
  Day 38:    Phase 24 (referral program, if launching with it)
  Day 39-40: Full security checklist pass, load test with realistic
             concurrent-user simulation, fix whatever breaks
  Day 41-42: Soft launch to a small closed group, watch dashboards closely,
             fix what real usage reveals before public launch
```

---

## Launch Checklist

```
[ ] Legal documents live and linked in footer (ToS, Privacy, AUP)
[ ] Business entity registered, business bank account active
[ ] All AI provider accounts funded with 30-day buffer, spend alerts set
[ ] .env fully populated in production — no placeholder values, no
    Docker-Compose-internal hostnames leaking into a non-Compose deploy
[ ] Database migrated, seeded with real admin account, seed script's
    test credentials removed/rotated before going public
[ ] Auth flow tested end-to-end by an actual human on an actual phone:
    signup, verify, login, logout, password reset, session persistence
[ ] Payment flow tested with a real (small) transaction, webhook
    idempotency verified by triggering the same webhook twice
[ ] Redeem code batch generated and spot-tested
[ ] Fraud thresholds reviewed — defaults are guesses; adjust after
    watching real usage patterns for a week
[ ] Monitoring dashboards showing live data, alert channels (Telegram/
    email) tested with a deliberately-triggered test alert
[ ] Status page live and accurate
[ ] Backup taken, restore tested on a scratch environment
[ ] Rate limits verified against a real client (not just reading the code)
[ ] Mobile responsiveness checked — most users will be on phones
[ ] Arabic RTL checked on a real device, not just browser dev tools
[ ] Support contact channel live (even if just a monitored email/WhatsApp)
[ ] Rollback procedure rehearsed at least once before it's needed for real
```
