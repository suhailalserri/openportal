# Payment Methods — Structural Plan

**Read this file before touching any payment-related code.** It exists so
any developer or AI picking up this project mid-stream can understand what
was decided, why, and exactly what's left — without re-deriving the whole
conversation that produced it.

Status legend: `[x]` done · `[ ]` not started · `[~]` in progress

---

## 1. Context — how we got here

This project originally planned Saudi-market payments (Moyasar, card
checkout, prices in SAR). That plan is **paused, not abandoned** — see
§2. The active market is Yemen, where:

- No major Yemeni e-wallet (Jaib, Floosak, Kuraimi) publishes a public
  merchant API for arbitrary online checkout the way Moyasar does.
- **Kuraimi Bank** is the one exception — they have a real, official
  "E-Pay API" (`kuraimibank.com/en/services/50`), evidenced by an
  actively-maintained open-source Laravel wrapper
  (`al-saloul/kuraimibank-payment`). Not integrated yet — needs a real
  merchant account + credentials from Kuraimi first. Tracked for later,
  not blocking this phase.
- **Jaib** has a WiFi-voucher marketplace built by a third party
  (`tabweeb.com.ye`) for MikroTik hotspot operators. It supports two
  fulfillment modes: live MikroTik server, or **a pre-uploaded PDF/CSV of
  codes** — the second mode is what we're using. It's a static list of
  codes tabweeb hands out one at a time as Jaib users buy them; there is
  **no API, no webhook, no callback**. We generate codes, export them,
  upload the file to tabweeb's dashboard manually, and top up when it
  runs low.

## 2. Currencies — YER and USD only, for now

- **YER (Yemeni Rial)** is the only customer-facing price. All Jaib and
  manual-transfer packages are priced in YER.
- **USD** is tracked internally alongside YER on every package, so model
  wholesale-cost margins stay visible even though customers never see
  dollars. (1 credit = $0.001 is already fixed in
  `packages/config/src/models.config.ts` — unchanged.)
- **SAR / Moyasar are disabled, not deleted.** The code, config entries,
  and webhook route stay in the repo but are inert (feature-flagged off /
  excluded from the active package list). Re-enable when expanding to
  Saudi customers — don't rebuild from scratch.
- Yemen has two rial values (north/south zones) — unresolved. Whoever
  finalizes Jaib package prices must confirm which zone's rate Jaib
  wallet balances use before publishing prices. Currently assumed
  530 YER = $1 as a working figure; revisit monthly, rate is volatile.

## 3. Payment methods in scope for this phase

1. **Jaib** (via tabweeb PDF/CSV upload) — primary
2. **Manual wallet transfer** (any wallet — Jaib, Floosak, Kuraimi, bank)
   with admin approval — secondary, for buyers who can't/won't use the
   Jaib flow

Both funnel into the **same underlying redeem-code system** — there is
no per-payment-method redemption logic. A code is a code; it grants
credits usable against any model, regardless of how it was sold. What
differs per payment method is only **which batch of codes gets
generated for it and how it's tracked**.

## 4. Data model

Three new/changed tables. `redeemCode()` and `generateCode()` in
`apps/api/src/services/redeem.service.ts` are **unchanged** — codes
still behave identically at redemption time (atomic single-use claim,
checksum validation, optional expiry, no expiry = `null`). This phase
only adds *tagging* for tracking, not new redemption behavior.

### `payment_methods` (new table)
| column | notes |
|---|---|
| `id` | uuid pk |
| `name` / `nameAr` | e.g. "Jaib" / "جيب" |
| `logoUrl` | nullable |
| `accountCode` | your tabweeb network code / wallet number — informational only, nothing calls it |
| `type` | `jaib_voucher` \| `manual_transfer` (extensible for Kuraimi/Floosak later) |
| `isActive` | bool |

### `packages` (new table — moved out of static config)
| column | notes |
|---|---|
| `id` | uuid pk |
| `name` / `nameAr` | e.g. "1,000 YER" / "١٬٠٠٠ ريال يمني" — **always specify "يمني" explicitly**, since Yemeni Rial and Saudi Riyal share the Arabic word "ريال" and the disabled SAR packages already use it unqualified |
| `priceYer` | integer, buyer-facing price |
| `priceUsdEquivalent` | for internal margin tracking only, never shown to buyer |
| `credits` | micro-credits granted on redemption |
| `description` / `descriptionAr` | shown on tabweeb's listing and/or your billing page |
| `isActive` | bool — inactive packages stop appearing in the generate-codes picker but existing codes keep working |

Why DB-backed instead of the existing `CREDIT_PACKAGES` static config:
this phase adds an admin UI to create/edit packages without a code
deploy. SAR packages remain in the static config (disabled) since they
aren't being actively managed right now.

### `redeem_codes` (existing table — add two FK columns)
- `packageId` → `packages.id`
- `paymentMethodId` → `payment_methods.id`
- Existing `batchId` / `batchLabel` / `creditAmount` / `faceValue`
  columns stay — `batchId` still groups "codes generated in one click,"
  which is the natural unit for a single PDF export/upload.

## 5. Package pricing (Jaib channel)

Derived from the same margin ratio the existing SAR packages already
use (50 base credits per 1 unit of retail currency, before per-tier
bonus), reapplied to YER after tabweeb's 10% cut — **not** a looser
estimate. See chat history (2026-09-12) for the derivation if this
needs re-checking after an exchange-rate update.

| Package | Price (YER) | Net after 10% cut | Credits |
|---|---|---|---|
| pkg_1000yer | 1,000 | ~900 YER (~$1.70) | 300 |
| pkg_2500yer | 2,500 | ~2,250 YER (~$4.25) | 850 |
| pkg_5000yer | 5,000 | ~4,500 YER (~$8.50) | 1,800 |
| pkg_10000yer | 10,000 | ~9,000 YER (~$17) | 3,800 |

These are seed values for the initial DB rows, not hardcoded — admin
can add/edit packages later without touching code.

## 6. Security & code behavior (already correct — no changes needed)

- Codes: `XXXX-XXXX-XXXX-CCCC`, ~60 bits entropy, HMAC checksum rejects
  guesses before hitting the DB (ADR-004 in `decisions.md`)
- Redemption: single atomic DB transaction, race-safe (see
  `redeem.service.ts`)
- Expiry: `expiresAt` nullable — leave `null` for "never expires
  unredeemed" (confirmed acceptable for this phase)
- Turnstile + rate limiting already gate the redeem endpoint (shipped
  earlier this phase)

## 7. Remaining work — in order

- [ ] **7.1** Disable (don't delete) Moyasar: feature-flag the webhook
      route and exclude SAR entries from the active package list shown
      anywhere in the UI
- [ ] **7.2** Schema migration: `payment_methods`, `packages` tables;
      add `packageId`/`paymentMethodId` FKs to `redeem_codes`
- [ ] **7.3** Admin: **Packages** section — create/edit/deactivate
      (name, YER price, USD equivalent, credits, description)
- [ ] **7.4** Admin: **Payment Methods** section — create/edit (name,
      logo, account code, type)
- [ ] **7.5** Admin: **Generate Codes** — pick payment method → pick
      package → count → generate (produces a tagged batch)
- [ ] **7.6** Admin: **Tracking dashboard** — table by payment method ×
      package: generated / redeemed / remaining, low-stock flag
- [ ] **7.7** Export: extend existing CSV, add PDF, both per-batch
- [ ] **7.8** Billing page (buyer-facing): package picker showing YER
      prices only; payment method selector (Jaib / manual transfer)
- [ ] **7.9** Jaib instructional panel: account/network code + numbered
      steps + link that scrolls to the existing redeem box
- [ ] **7.10** Manual-transfer flow: wallet number(s) + generated
      reference code + claim submission form + admin approval queue
      (schema: a `pending_manual_payments` table — user id, package id,
      reference code, submitted transaction id, status, screenshot url
      optional)

## 8. Explicitly out of scope for this phase

- Moyasar/SAR/card payments (disabled, revisit later)
- Kuraimi's official E-Pay API (real, but needs a merchant account first)
- Any Floosak integration (no public path found yet)
- MikroTik-based dynamic voucher generation (using the simpler
  pre-uploaded PDF/CSV mode instead)
