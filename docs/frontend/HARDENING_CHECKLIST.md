# Phase 9.1 — Hardening checklist

Sign-off sheet. Rows marked **static** were checked by reading code in the authoring session (no browser, no build). Everything else is for a human on the preview deployment. Mark each cell ✅ / ❌ + note.

## 1. Security headers (`next.config.ts` → `headers()`)

Shipped as **`Content-Security-Policy-Report-Only`** (nothing is blocked yet). To enforce: change `CSP_HEADER_NAME` in `next.config.ts` to `"Content-Security-Policy"` — after the steps below show **zero** CSP violations in the browser console.

| Flow (open DevTools console first) | Result |
|---|---|
| `/en/auth/register` — Turnstile widget renders and yields a token | |
| Sign in → `/chat`: send a message, stream completes | |
| Chat: message with a code block renders/highlights | |
| `/dashboard`: spend chart renders | |
| Settings → Security: 2FA QR renders | |
| Billing: payment-method logos (admin-pasted https URLs) render | |
| Landing page: no violations | |
| `/admin/*` (all 11 pages): no violations | |

Also confirm in Network → any document response: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and the CSP header are present (if Caddy/Vercel already adds a duplicate HSTS, keep one).

**Known limits:** static CSP (no nonce — `middleware.ts` frozen) ⇒ `script-src`/`style-src` keep `'unsafe-inline'`. `img-src` allows any `https:` (admin-pasted logo URLs). `Permissions-Policy` disables camera/microphone/geolocation — **when voice input ships, relax `microphone`**.

## 2. RTL (ar) — 360 px, tablet (768), desktop (1280)

- **static ✅** Physical-direction Tailwind classes outside `components/ui`: the only hits are comments or `magicui/*` decoration. `components/ui` dialogs use `left-1/2 -translate-x-1/2` (symmetric, correct in RTL).
- **static ✅** Directional chevrons (`dropdown-menu`, `conversation-sidebar`) carry `rtl:rotate-180`.
- Human pass, each page in **ar** at 360 / 768 / 1280 — no horizontal page scroll, no clipped text, icons/arrows mirrored, numbers/dates sane:

| Page | 360 | 768 | 1280 |
|---|---|---|---|
| Landing | | | |
| Login / Register / Forgot | | | |
| Chat (+ sidebar drawer, composer, param controls) | | | |
| Billing | | | |
| Dashboard (chart reads right-to-left) | | | |
| Usage | | | |
| Settings (all sections) | | | |
| Admin: overview, users (+detail), codes, packages, payment methods, manual payments | | | |
| Admin: models, channels, fraud, logs, audit (diff view) | | | |
| Legal pages | | | |

## 3. Accessibility

- **static ✅** Chat: a visually hidden `role="status" aria-live="polite"` region (in `chat-view.tsx`) announces "thinking" when a reply starts and "Response complete" when it ends. It deliberately does **not** live-read the growing message text (would re-announce every token).
- Keyboard only (no mouse): login → chat → send → open a dialog → Esc closes and focus returns to the trigger → admin table filter → confirm dialog. Visible focus ring on every stop.
- Screen reader spot-check (VoiceOver/NVDA): send a message; hear the two announcements once each.
- Form labels: every dialog input reachable by label (the 8c fix for codes/packages/payment methods); re-check any dialog added later.

### Contrast (computed from `styles/theme-presets.css`, preset `gateway`, WCAG 2.x)

| Pair | Light | Dark |
|---|---|---|
| foreground / background | 15.72 | 15.22 |
| muted-foreground / background | 5.59 | 6.44 |
| muted-foreground / card | 6.15 | 5.99 |
| muted-foreground / muted | 5.16 | 6.71 |
| destructive / background | 5.01 | 5.42 |
| success / background | 4.76 | 7.35 |
| primary-foreground / primary | **5.03** (was 3.61 ❌) | 8.48 |
| primary / background (links, text-primary) | **4.58** (was 3.28 ❌) | 8.13 |

**Change made:** light-mode `--primary` and `--sidebar-primary` `#B9791F` → `#98641A` (same hue, darker) so white-on-gold buttons and gold links pass AA 4.5:1. `--ring` and `--chart-1` stay `#B9791F` (non-text, need only 3:1: 3.28 ✅). **This is a visible brand change** — eyeball the gold in light mode; revert = the two lines in each of `theme.css` / `theme-presets.css`. Not re-checked: `warning`/`info` text, hover/disabled states, text over gradients, `sidebar-*` pairs, `magicui/*` (`confetti.tsx` hardcodes `#B9791F` as a fallback only).

## 4. Performance budgets (to be filled from a real build)

The plan's "measure first" step could not be done here (no `next build`). Fill from the `web-build` CI log's **First Load JS** column (or `next build` locally), then set budgets ≈ measured + 10%. Do **not** add `@next/bundle-analyzer` without also regenerating `pnpm-lock.yaml` (CI uses a frozen lockfile — use the `update-lockfile` workflow).

| Route | First Load JS (measured) | Budget |
|---|---|---|
| `/[locale]` (landing) | | |
| `/[locale]/auth/login` | | |
| `/[locale]/chat` | | |
| `/[locale]/billing` | | |
| `/[locale]/dashboard` | | |
| `/[locale]/usage` | | |
| `/[locale]/settings` | | |
| `/[locale]/admin` | | |
| `/[locale]/admin/logs` | | |

Repo facts for the audit: charts (recharts) and the QR code are already lazy-loaded; code highlighting is `rehype-highlight` (the plan says "shiki" — not used). Lazy-load highlighting only if `/chat` First Load JS is over budget.

## 5. Markdown safety fixtures

`components/markdown/safe-markdown.test.tsx` and `content/demo/chat-render-fixture.ts` exist; they were not re-reviewed or extended in this phase. Review request for a human: confirm fixtures cover raw HTML, `javascript:` links, remote images (blocked — `chat.remoteImageBlocked`), and `data:` URLs.
