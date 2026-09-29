# Deploy shutdown, `/health` and `/ready` (plan P3.2, closes N2)

## What happens on a deploy (SIGTERM)

| Time (default) | What the API does |
|---|---|
| t = 0 | Draining. New `/chat` gets **503 `SERVICE_RESTARTING`** with `Retry-After: 5` (retryable). `/ready` returns 503 `draining`. `/health` stays 200. Responses carry `Connection: close`. |
| t = 0 .. 90 s | In-flight `/chat` streams finish normally, so billing and the message save run as usual. As soon as none are left, shutdown continues. |
| t = 90 s (`SHUTDOWN_DRAIN_MS`) | Streams still running are **aborted**. `streamChat` bills the content already streamed (existing partial path, exactly once) and saves the message with `isPartial = true`. A stream aborted before any byte was written gets a 503 instead. A Telegram warning says how many were aborted. |
| up to +15 s (`SHUTDOWN_ABORT_GRACE_MS`) | Waits for that billing/saving to finish. |
| then (each closer bounded to 3 s) | Closes: HTTP server, the 3 workers, the 4 queues, the 4 other Redis clients (billing lock, idempotency, fraud, metrics), the DB pool (waits for queries already sent), Sentry flush. One failing or hanging closer never blocks the others. |
| exit | `0` on a clean shutdown, `1` if an operation was still running or the hard timer fired (`drain + grace + 12 s` = 117 s by default). |

**Hard limit:** after `SIGKILL` no code runs. Whatever is still executing when Render kills the process is **not billed**. That is why streams are aborted at 90 s instead of relying on a handler that cannot run. Streams have a 2-minute safety timeout, so a longer drain only costs longer deploys.

## Owner steps

1. **Render -> the API service -> Settings -> Shutdown delay: set to `120` seconds** (API field `maxShutdownDelaySeconds`; Render's default is 30 s and the maximum is 300 s). It must be **greater than** `drain + grace + 12 s` (117 s with the defaults). If you change `SHUTDOWN_DRAIN_MS`, keep that inequality. The exact UI label is from memory, so look for "Shutdown delay" / "Max shutdown delay".
2. Leave Render's **health check path on `/health`**. Do not point it at `/ready`: a Redis or DB blip would make Render pull a healthy instance and restart it, which is worse than the blip.
3. Point the external uptime monitor (UptimeRobot) at `GET /ready` (expects 200). It goes red when the DB or Redis is unreachable, and during a deploy drain.
4. Optional env vars (defaults are fine): `SHUTDOWN_DRAIN_MS` (1000..240000, default 90000), `SHUTDOWN_ABORT_GRACE_MS` (1000..60000, default 15000).

## `/health` vs `/ready`

- `/health` is liveness. It never touches the DB or Redis and stays 200 while draining.
- `/ready` runs `SELECT 1` and Redis `PING` (2 s timeout each), caches the result for 5 s and shares one probe between concurrent callers. Body: `{"status":"ready"|"not_ready"|"draining","db":"ok"|"down","redis":"ok"|"down"}`.

## Drill (do once, then tick the LAUNCH_CHECKLIST line "Graceful shutdown verified with a mid-stream deploy")

1. Start a long chat (ask for a very long answer) in the app, and keep it streaming.
2. Trigger a deploy (or "Restart" the service) while it streams.
3. Expect one of: the answer **completes** (drain finished it), or it **stops early** if the deploy took longer than 90 s (partial). Reloading the chat should show the message either way (`is_partial = true` when cut).
4. In the Render logs: `[shutdown] SIGTERM: draining (1 in flight ...)`, then `[shutdown] complete`. No `hard exit` line.
5. Ledger: exactly **one** usage row for that request. Adjust column names if they differ (from memory):
   ```sql
   select m.gateway_request_id, m.is_partial, count(t.*) as ledger_rows
   from messages m
   left join transactions t on t.request_id = m.gateway_request_id
   where m.role = 'assistant' and m.created_at > now() - interval '30 minutes'
   group by 1, 2 order by max(m.created_at) desc;
   ```
   `ledger_rows` must be 1 for the chat you interrupted.
6. During the deploy, `curl -i https://<api>/ready` -> 503 `draining` on the old instance while the new one answers 200 (only visible if you hit the old one directly).

## If it goes wrong

- Deploys hang for the full delay: a stream is not ending. Check for `aborting N stream(s)` in the logs; lower `SHUTDOWN_DRAIN_MS`.
- Users report cut answers after deploys: expected only when a stream outlives the drain window; they are billed for what they received.
- `hard exit` in the logs: a closer hung past the budget. The line before it names the operation or closer.
