# Redis policy runbook (P2.3, closes N1)

Redis holds BullMQ jobs, the P1.2 billing lock and rate-limit counters. Losing any of them silently is a money/availability bug.

## Rules
1. `maxmemory-policy` MUST be `noeviction`. LRU/LFU/random policies can delete a queued job or a lock.
2. Finished jobs are trimmed by the app (`jobs/queue-policy.ts`): completed = 24 h or 1000 jobs, failed = 7 days.
3. Memory alert at 70% of `maxmemory`. With `noeviction`, writes fail at 100%.

## What the app does by itself
- On api start and every 10 min (`redisHealth` job on the reports queue): reads `CONFIG GET maxmemory-policy` and `INFO memory`.
  - policy != noeviction -> Telegram CRITICAL + Sentry issue (`source:redis-health`, `check:eviction-policy`), repeated every 6 h while wrong.
  - memory >= 70% -> Telegram warning + Sentry issue (`check:memory`), repeated hourly.
  - If the provider blocks `CONFIG` or reports `maxmemory:0`, the app logs `[redis-health] ...` once and cannot judge: do the manual steps below.
- Every failed job attempt: Sentry event (tags `source:worker`, `queue`, `job`, `attempt`), metric `aip_job_failures_total{queue}`, and a Telegram warning when a queue has >= 5 failures in 5 min (max one per 15 min per queue per replica).

## Owner steps (cannot be done from code)
1. Upstash console -> your database -> Details/Configuration: confirm **Eviction is OFF** (this is `noeviction`). If it is on, turn it off.
2. Per L15 the database must be on a paid plan before real users (Free is dev/test only).
3. Upstash -> set a usage/memory notification at ~70% as the backstop for the in-app check.
4. Verify from any Redis client: `CONFIG GET maxmemory-policy` -> `noeviction` (if the provider blocks CONFIG, rely on step 1).

## Drills (do once, then tick LAUNCH_CHECKLIST line "Upstash eviction is off")
- **Failing job:** deploy, then trigger a job that throws (e.g. temporarily point RESEND key at garbage and register a user, or use a one-off script that adds a bad job to the `email` queue). Expect: Sentry issue tagged `queue:email`; `/metrics` shows `aip_job_failures_total{queue="email"}` rising; after 5 failures in 5 min, one Telegram message.
- **Retention:** in the Upstash data browser, `bull:email:failed` entries older than 7 days disappear (needs new jobs to finish, BullMQ trims on job completion).
- **Policy alert:** only if you can change the policy safely on a non-prod database: set it to `allkeys-lru`, wait <= 10 min, expect the CRITICAL Telegram, set it back.

## Notes
- The `messages` queue is created in `queue.ts` but has NO worker and nothing enqueues to it (`queueSaveMessage` is unused). It got retention like the others; deleting it is a separate cleanup.
- Jobs already sitting in Redis keep their old options; retention applies to jobs added after this deploy.
