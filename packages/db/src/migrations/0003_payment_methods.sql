-- ──────────────────────────────────────────────────────────────────────
-- Payment methods phase — pivot to Yemen market (see decisions.md ADR-007
-- and docs/PAYMENT_METHODS_PLAN.md for the full design).
--
-- Adds: payment_methods, packages, pending_manual_payments tables, plus
-- nullable packageId/paymentMethodId tags on redeem_codes. Does NOT touch
-- redeemCode()/generateCode() behavior (ADR-004) — this is tagging and two
-- new tables only. Moyasar/SAR stays in the codebase but is feature-flagged
-- off in application code (packages/config/src/constants.ts
-- FEATURE_FLAGS.MOYASAR_ENABLED + apps/web/app/api/webhooks/payment/route.ts)
-- — nothing to disable at the schema level.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0003_payment_methods.sql
-- ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM ('jaib_voucher', 'manual_transfer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE manual_payment_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── payment_methods ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             varchar(100) NOT NULL,
  name_ar          varchar(100) NOT NULL,
  type             payment_method_type NOT NULL,
  logo_url         text,
  account_code     varchar(100),
  instructions     text,
  instructions_ar  text,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

-- ── packages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  varchar(100) NOT NULL,
  name_ar               varchar(100) NOT NULL,
  price_yer             integer NOT NULL,
  price_usd_equivalent  numeric(10,2) NOT NULL,
  credits               bigint NOT NULL,
  description           text,
  description_ar        text,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamp NOT NULL DEFAULT now(),
  updated_at            timestamp NOT NULL DEFAULT now()
);

-- ── redeem_codes tagging (nullable — existing rows are untagged) ──────
ALTER TABLE redeem_codes
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id),
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES payment_methods(id);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_package_method
  ON redeem_codes(payment_method_id, package_id);

-- ── pending_manual_payments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_manual_payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id),
  package_id             uuid NOT NULL REFERENCES packages(id),
  payment_method_id      uuid NOT NULL REFERENCES payment_methods(id),
  reference_code         varchar(24) UNIQUE NOT NULL,
  submitted_tx_ref       varchar(150),
  sender_phone           varchar(30),
  sender_name            varchar(100),
  screenshot_url         text,
  notes                  text,
  status                 manual_payment_status NOT NULL DEFAULT 'pending',
  reviewed_by_admin_id   uuid REFERENCES users(id),
  reviewed_at            timestamp,
  rejection_reason       text,
  granted_transaction_id uuid REFERENCES transactions(id),
  created_at             timestamp NOT NULL DEFAULT now()
);

-- Admin approval queue always filters/sorts unresolved claims first.
CREATE INDEX IF NOT EXISTS idx_pending_manual_payments_status
  ON pending_manual_payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_manual_payments_user
  ON pending_manual_payments(user_id, created_at DESC);

-- updated_at triggers (mirrors the pattern in 0001_constraints.sql — safe
-- to (re)create here since managed Postgres providers skip init.sql).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_methods_updated_at ON payment_methods;
CREATE TRIGGER payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS packages_updated_at ON packages;
CREATE TRIGGER packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Seed: the two in-scope payment methods ─────────────────────────────
-- Idempotent via WHERE NOT EXISTS (no natural unique key on name to
-- ON CONFLICT against, and the admin UI can edit these freely after seed —
-- this only ensures they exist once on a fresh database).
INSERT INTO payment_methods (name, name_ar, type, account_code, instructions, instructions_ar, sort_order)
SELECT 'Jaib', 'جيب', 'jaib_voucher', 'SET-TABWEEB-NETWORK-CODE',
       '1. Open the Jaib app. 2. Buy a voucher using the network code above. 3. Enter the code you receive in the redeem box below.',
       '١. افتح تطبيق جيب. ٢. اشترِ كرت شحن باستخدام كود الشبكة أعلاه. ٣. أدخل الكود الذي تحصل عليه في صندوق الاستبدال أدناه.',
       1
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE type = 'jaib_voucher');

INSERT INTO payment_methods (name, name_ar, type, account_code, instructions, instructions_ar, sort_order)
SELECT 'Manual Wallet Transfer', 'تحويل محفظة يدوي', 'manual_transfer', 'SET-WALLET-NUMBER',
       '1. Transfer the exact package amount to the wallet number above, using the reference code shown as the transfer note. 2. Submit the claim form with your transaction details. 3. Credits are added after admin verification (usually within a few hours).',
       '١. حوّل المبلغ المطابق للباقة إلى رقم المحفظة أعلاه، واكتب رمز المرجع الظاهر كملاحظة للتحويل. ٢. أرسل نموذج المطالبة ببيانات التحويل. ٣. تتم إضافة الرصيد بعد تحقق الإدارة (عادة خلال ساعات قليلة).',
       2
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE type = 'manual_transfer');

-- ── Seed: initial YER packages (PAYMENT_METHODS_PLAN.md §5) ───────────
-- Seed values only — fully editable afterwards from /admin/packages.
INSERT INTO packages (name, name_ar, price_yer, price_usd_equivalent, credits, description, description_ar, sort_order)
SELECT '1,000 YER', '١٬٠٠٠ ريال يمني', 1000, 1.70, 300 * 1000000,
       '300 credits', '٣٠٠ رصيد', 1
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE price_yer = 1000);

INSERT INTO packages (name, name_ar, price_yer, price_usd_equivalent, credits, description, description_ar, sort_order)
SELECT '2,500 YER', '٢٬٥٠٠ ريال يمني', 2500, 4.25, 850 * 1000000,
       '850 credits', '٨٥٠ رصيد', 2
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE price_yer = 2500);

INSERT INTO packages (name, name_ar, price_yer, price_usd_equivalent, credits, description, description_ar, sort_order)
SELECT '5,000 YER', '٥٬٠٠٠ ريال يمني', 5000, 8.50, 1800 * 1000000,
       '1,800 credits', '١٬٨٠٠ رصيد', 3
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE price_yer = 5000);

INSERT INTO packages (name, name_ar, price_yer, price_usd_equivalent, credits, description, description_ar, sort_order)
SELECT '10,000 YER', '١٠٬٠٠٠ ريال يمني', 10000, 17.00, 3800 * 1000000,
       '3,800 credits', '٣٬٨٠٠ رصيد', 4
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE price_yer = 10000);
