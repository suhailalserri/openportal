# Architecture Decision Records

## ADR-001: Use New API (Go) as Gateway (not custom)
- **Date:** Project start
- **Decision:** Use calciumion/new-api as the AI gateway
- **Reasoning:** Handles channel failover, token counting, model routing out-of-box.
  Building equivalent from scratch = 4+ weeks. New API = 1 day setup.
- **Trade-off:** Dependency on third-party open-source project.
- **Mitigation:** Monitor repository activity. The gateway is replaceable behind our proxy layer.

## ADR-002: Custom Next.js frontend (not LobeChat/OpenWebUI)
- **Date:** Project start
- **Decision:** Build custom frontend
- **Reasoning:** Arabic RTL, branding, billing UX all require deep control.
  Forking LobeChat = fighting the framework. Custom = full ownership.
- **Trade-off:** More initial build time.
- **Mitigation:** shadcn/ui + Tailwind make custom UI fast to build.

## ADR-003: Credits stored as micro-integers (not floats)
- **Date:** Project start
- **Decision:** Store all credits as bigint micro-units (1 credit = 1,000,000 micro)
- **Reasoning:** Floating point arithmetic in billing is dangerous.
  0.1 + 0.2 = 0.30000000000000004 in JavaScript.
- **Trade-off:** Extra conversion logic for display.
- **Mitigation:** formatCredits() utility handles display everywhere.

## ADR-004: Redeem codes with checksum (not pure random)
- **Date:** Project start
- **Decision:** Last 4 chars of code are HMAC-SHA256 checksum of body
- **Reasoning:** Eliminates ~97% of brute-force DB hits.
  Format validation before hitting database.
- **Trade-off:** Slightly more complex code generation.
- **Mitigation:** generateCode() and validateCodeFormat() utilities encapsulate this.

## ADR-005: Caddy over Nginx as reverse proxy
- **Date:** Project start
- **Decision:** Use Caddy v2 for reverse proxy and SSL
- **Reasoning:** Automatic Let's Encrypt with zero configuration.
  HTTP/3 support. Simpler config syntax. No certbot cron needed.
- **Trade-off:** Less documentation than Nginx online.
- **Mitigation:** Caddyfile is well-documented in this codebase.

## ADR-006: Valkey over Redis
- **Date:** Project start
- **Decision:** Use Valkey (Redis fork) instead of Redis
- **Reasoning:** Redis changed license to SSPL (not truly open source).
  Valkey = Apache 2.0, API-compatible drop-in replacement.
- **Trade-off:** Newer project, less ecosystem tooling.
- **Mitigation:** 100% API compatible. Can switch back to Redis if needed.
