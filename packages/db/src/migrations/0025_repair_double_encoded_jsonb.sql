-- ──────────────────────────────────────────────────────────────────────
-- 0025 — repair JSON stored as a JSON string (found while shipping P6.4).
--
-- With drizzle-orm 0.31.4 + postgres-js, the stock jsonb() column stored objects as a jsonb STRING that
-- contains the object text (stringified twice). Reads hid it (drizzle parses a string back), but
-- jsonb_typeof was 'string' and JSON operators (details ->> 'x') returned nothing. New writes are fixed
-- in code (packages/db/src/schema/jsonb-value.ts); this repairs the rows written before.
--
-- Columns: fraud_events.details, audit_logs.before, audit_logs.after, models.category_scores.
--
-- Only a row whose value is a jsonb string whose text starts with { or [ AND parses to an object or an
-- array is rewritten (to that object/array). Everything else is left exactly as it is: genuine JSON
-- strings, NULLs, values that are already objects/arrays, and text that does not parse (skipped, not an
-- error). Re-runnable: a repaired row is no longer a string, so a second run changes nothing.
--
-- Safe in either order with the code deploy: the new read path accepts strings and objects.
-- Side effect: models has an updated_at trigger, so repaired model rows get updated_at = now().
-- Take a backup first (it is a production data update). ROLLBACK, if ever needed, per column:
--   UPDATE <table> SET <col> = to_jsonb(<col>::text) WHERE jsonb_typeof(<col>) IN ('object','array');
--   (this would also re-stringify values that were always objects, so only use it right after this run)
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0025_repair_double_encoded_jsonb.sql
-- (or paste it into the Supabase SQL editor; it prints a NOTICE with the counts)
-- ──────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r        record;
  parsed   jsonb;
  repaired integer := 0;
  skipped  integer := 0;
BEGIN
  -- fraud_events.details
  FOR r IN
    SELECT id, details AS v FROM fraud_events
    WHERE jsonb_typeof(details) = 'string' AND (details #>> '{}') ~ '^[[:space:]]*[\[{]'
  LOOP
    BEGIN
      parsed := (r.v #>> '{}')::jsonb;
      IF jsonb_typeof(parsed) IN ('object', 'array') THEN
        UPDATE fraud_events SET details = parsed WHERE id = r.id;
        repaired := repaired + 1;
      END IF;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;

  -- audit_logs.before
  FOR r IN
    SELECT id, before AS v FROM audit_logs
    WHERE jsonb_typeof(before) = 'string' AND (before #>> '{}') ~ '^[[:space:]]*[\[{]'
  LOOP
    BEGIN
      parsed := (r.v #>> '{}')::jsonb;
      IF jsonb_typeof(parsed) IN ('object', 'array') THEN
        UPDATE audit_logs SET before = parsed WHERE id = r.id;
        repaired := repaired + 1;
      END IF;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;

  -- audit_logs.after
  FOR r IN
    SELECT id, after AS v FROM audit_logs
    WHERE jsonb_typeof(after) = 'string' AND (after #>> '{}') ~ '^[[:space:]]*[\[{]'
  LOOP
    BEGIN
      parsed := (r.v #>> '{}')::jsonb;
      IF jsonb_typeof(parsed) IN ('object', 'array') THEN
        UPDATE audit_logs SET after = parsed WHERE id = r.id;
        repaired := repaired + 1;
      END IF;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;

  -- models.category_scores (a map: only an object is valid here)
  FOR r IN
    SELECT id, category_scores AS v FROM models
    WHERE jsonb_typeof(category_scores) = 'string' AND (category_scores #>> '{}') ~ '^[[:space:]]*\{'
  LOOP
    BEGIN
      parsed := (r.v #>> '{}')::jsonb;
      IF jsonb_typeof(parsed) = 'object' THEN
        UPDATE models SET category_scores = parsed WHERE id = r.id;
        repaired := repaired + 1;
      END IF;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;

  RAISE NOTICE '0025: repaired % value(s), skipped % unparseable value(s)', repaired, skipped;
END
$$;
