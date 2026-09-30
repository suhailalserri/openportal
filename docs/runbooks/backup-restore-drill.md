# Backup and restore drill (plan P4.1, closes G11)

**What this is:** an independent nightly backup of the database(s) to storage outside Supabase, and a drill that proves it can be restored. Backups you have never restored are not backups.

**Status:** code delivered. Not done until section 4 has been run once for real and the RTO in section 6 is filled in.

## 1. What each layer gives you

| Layer | What it is | Status |
|---|---|---|
| Supabase built-in backups | Daily backups kept by Supabase; downloadable and longer retention on Pro (L18). Point-in-time recovery (PITR) is a paid add-on. | **Owner: fill in** — plan (Free/Pro) ____ · daily backup retention ____ days · PITR on/off ____ |
| This repo: nightly `pg_dump` | `.github/workflows/db-backup.yml` at 02:17 UTC, encrypted, stored in Cloudflare R2. Protects against losing the Supabase project or account, and against a bad migration or delete noticed late. | Needs the secrets in section 2 |
| Weekly automatic restore test | `.github/workflows/db-restore-drill.yml`, Sundays 03:37 UTC, target `ci-container`. Restores the newest dump into a throwaway Postgres and runs the ledger check. | Needs the same secrets |

PITR decision (owner): with a real ledger, decide whether losing up to 24 hours of transactions is acceptable. If not, buy the PITR add-on on the app project and write the decision here: ____.

## 2. One-time setup (all from a phone)

1. **Cloudflare R2:** create a **private** bucket (for example `ai-platform-backups`). Create an R2 API token with *Object Read & Write* limited to that bucket. Note the Account ID.
2. **Bucket lifecycle rule:** in the bucket settings add an object lifecycle rule that deletes objects after **30 days**. (The scripts never delete anything.)
3. **GitHub, Repo → Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   |---|---|
   | `BACKUP_DATABASE_URL` | app Supabase connection string, **session mode / direct, port 5432** (not 6543). If unset, `DATABASE_URL` is used. |
   | `GATEWAY_DATABASE_URL` | optional: the New API gateway's Postgres string, same rules. Without it the gateway database is **not** backed up (the workflow prints a notice). |
   | `BACKUP_PASSPHRASE` | a long random passphrase. **Store a copy in your password manager, outside GitHub.** Lose it and every backup is unreadable. |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` | from step 1 |
   | `SCRATCH_DATABASE_URL` | for the real drill only, section 4: an **empty** scratch database URL. |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | optional; same values the api uses. Without them a failure is only visible in the Actions tab. |

4. Run **Actions → DB Backup → Run workflow** once. Expected: green, and the run summary lists an object key such as `app/2026/10/ai-platform-app-….pgdump.enc`. Confirm the object exists in R2.
5. Run **Actions → DB Restore Drill → Run workflow** with `ci-container`. Expected: green, the summary shows the ledger check and timings.

Scheduled runs only fire from the default branch, and GitHub pauses scheduled workflows after 60 days with no repository activity. Check R2 for a fresh object each week for the first month.

## 3. What the ledger check means

`infra/scripts/ledger-check.sql` prints `check | value | ok`. Any `ok = f` is a failure.

- `ledger_total_matches`: the sum of all balances equals the sum of all `transactions.amount` (debits are stored negative). This holds because every balance change writes a transaction in the same DB transaction and new balances start at 0 (`SIGNUP_BONUS_MICRO_CREDITS = 0`).
- `users_where_credits_differ_from_tx_sum`: same test per user. A non-zero count names the problem; find the users with `select b.user_id, b.credits, coalesce(sum(t.amount),0) from balances b left join transactions t using (user_id) group by 1,2 having b.credits <> coalesce(sum(t.amount),0);`
- `negative_balances`: always 0 (there is also a DB constraint).
- `info_*` rows are informational. `info_transactions_without_balance_row` is non-zero if an account was deleted but its transactions were kept.
- Development databases seeded by `seed.ts` will fail this check on purpose (seeded credits have no transaction). Production must never fail it. If it does, treat it like `docs/runbooks/fraud-detected.md`: stop, investigate, do not "fix" by editing balances.

## 4. The drill (do this once for real, then quarterly)

Goal: prove the backup restores into a real Supabase-type database, and measure wall-clock time.

1. Create a **scratch Supabase project** (a new free project is fine; do not reuse production). Copy its session-mode connection string (port 5432) into the `SCRATCH_DATABASE_URL` secret. It must be empty: the script refuses a target that has users, and refuses any URL equal to a production secret.
2. Note the time. Run **Actions → DB Restore Drill → Run workflow**: target `scratch-supabase`, key empty (newest backup).
3. When it finishes, open the run summary. It shows the object restored, the ledger check output and `TIMINGS: download …, decrypt …, restore …, verify …, TOTAL …`.
4. Compare with production: the row counts and totals in the summary should match production **as of the backup time** (`users_count`, `balances_sum_credits`, `info_latest_transaction_at`). Run the same query on production with `psql "$DATABASE_URL" -tA -F '|' -f infra/scripts/ledger-check.sql`, or from the Supabase SQL editor.
5. Delete the scratch project when done.

Pass criteria: all `ok = t`; the counts match production at backup time; total time recorded in section 6.

## 5. Real disaster: restoring into a NEW production database

Not automated on purpose. Steps:

1. Stop writes: put the api in maintenance (Render: suspend the api service) so no new transactions are created against a database you are about to replace.
2. Create the new database (new Supabase project, Pro). Get its session-mode string.
3. Restore from a machine with PostgreSQL 17 client tools and the AWS CLI:
   ```bash
   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto
   export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
   EP=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
   aws s3 cp s3://<bucket>/<key> dump.enc --endpoint-url $EP
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in dump.enc -out dump.pgdump   # asks for BACKUP_PASSPHRASE
   pg_restore --clean --if-exists --no-owner --no-privileges --dbname "<NEW_DB_URL>" dump.pgdump
   psql "<NEW_DB_URL>" -tA -F '|' -f infra/scripts/ledger-check.sql
   ```
4. Re-apply anything not in the dump: hand-written migrations newer than the backup (`db-migrate.yml` lists them), and check `0017` RLS on `platform_config`.
5. Point `DATABASE_URL` (Render api, Vercel web, GitHub secrets) at the new database, redeploy, run the ledger check, then resume traffic.
6. Rotate the secrets that were exposed to the old project if it was compromised (`docs/runbooks/secret-rotation.md`).

What a dump does not contain: Supabase Auth users (the app uses its own `users` table in `public`), Storage objects (not used before P5.1), roles and grants, extensions outside `public`.

## 6. Results (owner fills in after the drill)

| Item | Value |
|---|---|
| Supabase plan / backup retention / PITR | |
| Date of first real drill | |
| Backup restored (object key) | |
| Ledger check | pass / fail |
| Counts matched production at backup time | yes / no |
| **RTO (wall-clock, section 4 TOTAL plus your own start-to-finish time)** | |
| Notes / problems | |
