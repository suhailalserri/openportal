-- P4.2 - "no unbilled completions" reconciliation, scoped to the load-test users.
-- Run:  psql "$DATABASE_URL" -tA -F '|' -v completed=<streams_completed from k6> -f infra/loadtest/reconcile.sql
-- Output: check_name | value | ok   (a line ending in |f is a failure)
--
-- How billing is recorded (gateway.service.ts): after a stream, deductCreditsAtomic writes a
-- usage_debit transaction with request_id = the lock's requestId, and the assistant message is
-- saved with gateway_request_id = the same id and credit_cost = the charge. So:
--   an assistant message with credit_cost > 0 and NO usage_debit = a response given for free.
WITH lt AS (SELECT id FROM users WHERE email LIKE 'loadtest-%@example.invalid'),
msgs AS (
  SELECT m.gateway_request_id AS rid, m.credit_cost
  FROM messages m JOIN conversations c ON c.id = m.conversation_id
  WHERE c.user_id IN (SELECT id FROM lt) AND m.role = 'assistant' AND m.credit_cost > 0
),
debits AS (
  SELECT t.request_id AS rid, -t.amount AS cost
  FROM transactions t
  WHERE t.user_id IN (SELECT id FROM lt) AND t.type = 'usage_debit'
)
SELECT 'assistant_messages_charged'::text AS check_name, (SELECT count(*) FROM msgs)::text AS value, true AS ok
UNION ALL
SELECT 'usage_debits', (SELECT count(*) FROM debits)::text, true
UNION ALL
SELECT 'k6_streams_completed', :'completed', true
UNION ALL
SELECT 'unbilled_completions (message with no debit)',
       count(*)::text, count(*) = 0
FROM msgs m WHERE NOT EXISTS (SELECT 1 FROM debits d WHERE d.rid = m.rid)
UNION ALL
SELECT 'cost_mismatch (message cost <> debit)',
       count(*)::text, count(*) = 0
FROM msgs m JOIN debits d ON d.rid = m.rid WHERE m.credit_cost <> d.cost
UNION ALL
SELECT 'double_billed_requests',
       count(*)::text, count(*) = 0
FROM (SELECT rid FROM debits WHERE rid IS NOT NULL GROUP BY rid HAVING count(*) > 1) x
UNION ALL
SELECT 'completed_streams_without_a_debit (k6 completed > debits)',
       GREATEST((:'completed')::bigint - (SELECT count(*) FROM debits), 0)::text,
       (:'completed')::bigint <= (SELECT count(*) FROM debits)
UNION ALL
SELECT 'info_debits_without_saved_message (message save lost)',
       count(*)::text, true
FROM debits d WHERE NOT EXISTS (SELECT 1 FROM msgs m WHERE m.rid = d.rid)
UNION ALL
SELECT 'info_users_fraud_flagged', count(*)::text, true
FROM users WHERE id IN (SELECT id FROM lt) AND is_fraud_flagged = true
UNION ALL
SELECT 'info_fraud_events', count(*)::text, true
FROM fraud_events WHERE user_id IN (SELECT id FROM lt);
