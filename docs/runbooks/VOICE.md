# Runbook: Voice input / transcription (P5.3)

A recording is uploaded to the private `audio` bucket (P5.1), sent to a speech-to-text model through the gateway
(`/v1/audio/transcriptions`), billed, and **deleted**. The transcript is returned as plain text for an editable composer; it is
never saved as a message and never sent on its own. **There is no mic button yet** (the composer is P6.3): you test
everything with curl.

## 1. Turn it on (owner, in this order)

No migration, no new environment variable, no new dependency, no lockfile run.

1. **Gateway.** In New API, add a channel that serves a speech-to-text model (for example `whisper-1` on an OpenAI key). Check the
   gateway directly first (use your real `GATEWAY_URL` and `GATEWAY_MASTER_KEY` from Render):
   `curl -s "$GATEWAY_URL/v1/audio/transcriptions" -H "Authorization: Bearer $GATEWAY_MASTER_KEY" -F model=whisper-1 -F file=@test.mp3 -F response_format=json`
   -> `{"text":"..."}`. If this fails, nothing below will work.
2. **Models -> Sync now** in the admin. `whisper-1` appears as *pending*.
3. **Publish it** in the admin model form with these values (the form's labels say "tokens"; for this one row the unit is **audio seconds**):
   - Wholesale cost **input per 1M** = **USD per minute x 16,667**. whisper-1 at $0.006/min -> **100**. gpt-4o-mini-transcribe at about $0.003/min -> **50**.
   - Wholesale cost **output** = 0 (ignored). Markup as you like (2 = 2x). Context window / max output: any positive number (1000).
   - A price under **5** is refused at call time (`TRANSCRIPTION_NOT_CONFIGURED`): it was almost certainly a token price.
4. **Mark it as a speech model** (Supabase SQL editor; there is no admin toggle for this, on purpose):
   ```sql
   update models set categories = array_append(categories, 'transcription')
   where id = 'whisper-1' and not ('transcription' = any(categories));
   select id, status, is_available, categories, wholesale_cost_input_per_m, markup_multiplier from models where id = 'whisper-1';
   ```
   Re-saving the row in the admin form keeps the marker. From now on the model is **not** in the chat picker and `/chat` refuses it.
5. Push, let CI and the Render deploy run. Storage (`SUPABASE_*`) must already be configured (P5.1).

## 2. What it enforces

| Rule | Value | Where |
|---|---|---|
| Who | signed-in, usable account; the recording belongs to the user, not to a conversation | `voice.*` |
| Type / size | audio/webm, ogg, mp4, mpeg, wav; 15 MiB per voice note (bucket allows 25); 100 voice notes per 24 h (separate from the 30 attachments) | `storage.policy.ts`, `transcription.policy.ts` |
| Length | 5 minutes max, judged from the declared duration AND from the byte size (a client cannot hide a long file) | `estimateSeconds` |
| Lock | runs under the P1.2 billed-operation lock: a second concurrent billed call of the same user gets `REQUEST_IN_PROGRESS`; Redis down -> `BILLING_LOCK_UNAVAILABLE` (fail closed) | `voice.router.ts` |
| Affordability | balance must cover the **estimate** BEFORE any download or provider call, else `INSUFFICIENT_BALANCE` | `transcription.core.ts` |
| What is billed | the **provider-reported duration** if the answer carries one (rounded up to whole seconds, minimum 1 s). If it does not (for example token-priced models), our estimate: never below what the file size implies, never below what the client declared | `resolveBillableSeconds` |
| Silence | billed like speech (the provider charges us); `text` comes back empty | |
| Failure | provider down / 429 / 404 / timeout: **not billed**, audio kept so the same `audioId` can be retried. Undecodable file (400/413/415/422): not billed, audio deleted | |
| Deduction refused | transcript **withheld**, `INSUFFICIENT_BALANCE`, audio deleted, error logged (fail closed on money) | |
| Privacy | audio deleted right after billing; the 30-min sweep removes any audio older than 24 h; the transcript is never logged or stored | `discardConfirmed`, `sweep` |
| Ledger | one `usage_debit` row, description `Transcription (Ns)`, `model_id` set; token columns are empty | `transactions` |

Cost of N seconds in micro-credits = `N x price_per_1M_seconds x markup / 0.001` (1 credit = 1,000,000 micro, `CREDIT_VALUE_USD = 0.001`).
Example: 43 s, price 100, markup 2 -> 8,600,000 micro = 8.6 credits.

## 3. Where it works

Same as attachments: the api host only (`https://<render-service>/trpc/voice.*`). Through Vercel's `/api/trpc` it answers
`STORAGE_DISABLED`. How the browser reaches it is the open P6.3 decision.

## 4. Verify by hand (owner; nothing here was run by me)

Same token and API base as `ATTACHMENTS.md` section 4. You also need a short audio file, for example a 10-second `test.mp3`.

```bash
API=https://<your-render-service>.onrender.com
TOKEN=<session token>
FILE=./test.mp3
SIZE=$(wc -c < "$FILE" | tr -d ' ')
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

# 1. upload URL (no conversation needed)
curl -s -X POST "$API/trpc/voice.createUploadUrl" "${H[@]}" -d "{\"mimeType\":\"audio/mpeg\",\"sizeBytes\":$SIZE}"
ID=<audioId>; URL='<uploadUrl>'

# 2. PUT the bytes
curl -s -X PUT "$URL" -H 'Content-Type: audio/mpeg' --data-binary "@$FILE"

# 3. confirm
curl -s -X POST "$API/trpc/voice.confirm" "${H[@]}" -d "{\"audioId\":\"$ID\"}"

# 4. note the balance first:  select credits from balances where user_id = '<your user id>';

# 5. transcribe (10000 = about how long the clip is, in ms)
curl -s -X POST "$API/trpc/voice.transcribe" "${H[@]}" -d "{\"audioId\":\"$ID\",\"durationMs\":10000,\"language\":\"en\"}"
# -> {"result":{"data":{"text":"...","seconds":10,"creditsCharged":2000000,"modelId":"whisper-1"}}}
```

Then check, in SQL:
```sql
select type, amount, description, model_id, created_at from transactions where user_id = '<id>' order by created_at desc limit 1;
select status, deleted_at from storage_objects where id = '<audioId>';   -- deleted
```
**Pass when:** the text is right; exactly one new `usage_debit` of `Transcription (Ns)` whose `amount` equals `N x price x markup / 0.001`; the balance dropped by exactly that; the object is `deleted`.
Also tell me which `seconds` you got compared with the real clip length: it shows whether your gateway passes the provider's duration through or we fell back to the estimate.

Negative checks (each must fail as stated, and change no balance):
1. Transcribe the same `audioId` again -> `AUDIO_NOT_FOUND`.
2. Another user's `audioId`, or a random uuid -> `AUDIO_NOT_FOUND`.
3. An `audioId` that was created but never PUT/confirmed -> `AUDIO_NOT_FOUND`.
4. A user with 0 balance (or a balance below the estimate) -> `INSUFFICIENT_BALANCE`; the gateway logs show **no** transcription request.
5. `durationMs: 400000` -> `AUDIO_TOO_LONG`.
6. Two `voice.transcribe` calls at the same moment for one user -> one succeeds, the other `REQUEST_IN_PROGRESS`.
7. Disable the gateway channel (or set the model `is_available = false`) -> `TRANSCRIPTION_NOT_CONFIGURED` / `TRANSCRIPTION_UNAVAILABLE`, no debit, and for the channel case the audio is still there for a retry.
8. `select id from models` through the public list (`GET $API/trpc/models.list`) does not contain `whisper-1`; `POST /chat` with `"model":"whisper-1"` -> `404 MODEL_NOT_FOUND`.

## 5. Watching it

- Spend shows in the normal credits-spent metric under the model id; upstream latency/errors under `aip_upstream_*` with the speech model id.
- Render logs: `[voice] deduct ...` or `[voice] deduction refused ...` means money was not collected for a finished transcription; it should be rare and is worth a look each time.
- If `seconds` billed always equals your estimate and never the provider's, the gateway is not returning usage: acceptable, but the estimate then decides the price.

## 6. Turn it off / roll back

- Soft: `update models set is_available = false where id = 'whisper-1';` -> `TRANSCRIPTION_NOT_CONFIGURED`.
- Or delete the gateway channel. Existing recordings are removed by the sweep within 24 h.
- Code rollback is a plain revert; there is no schema change.
