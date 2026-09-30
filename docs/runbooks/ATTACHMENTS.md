# Runbook: Attachments (P5.2a upload + extraction, P5.2b use in /chat)

Files are uploaded to the private `attachments` bucket (P5.1), then text is extracted from PDF, DOCX and TXT in an
isolated worker thread. Since 5.2b, `POST /chat` accepts `attachmentIds` so a document contributes text and an image is
answered by a vision model. **There is still no UI** (the composer is P6.3): you test everything by calling the api with curl.

## 1. Turn it on (owner, in this order)

1. **Migration first.** Supabase SQL editor -> paste `packages/db/src/migrations/0022_attachments.sql` -> Run. Needs 0021 applied. Safe to run twice.
2. Push; run the **Update Lockfile** workflow (two new api dependencies: `unpdf`, `fflate`), then let CI and the Render deploy run.
3. No new env vars. It is active when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (already true after P5.1).

## 2. What it enforces

| Rule | Value | Where |
|---|---|---|
| Who can upload | signed-in, usable account; conversation must be yours and live | `attachments.createUploadUrl` -> storage service |
| Type, size, quotas | P5.1 rules: png/jpeg/webp/gif/pdf/txt/docx, 20 MiB, 200 MiB total, 30 uploads/24 h | `storage.policy.ts` |
| Real type | the bytes must match the declared type (magic bytes; DOCX must contain `word/document.xml`); else `TYPE_MISMATCH` | `extraction/file-type.ts` |
| Extraction | one worker thread per file, heap cap 256 MB, hard timeout 20 s, then terminated | `extraction.runner.ts`, `attachments.policy.ts` |
| DOCX bomb guard | max 5,000 zip entries, `document.xml` max 30 MB inflated | `extract.ts` |
| Text cap | 400,000 characters stored (`truncated = true` when cut). `/chat` cuts again to what fits the chosen model's context window | `attachments.policy.ts` |
| Failed file | status `failed` + `errorCode`, extracted text cleared, **object deleted immediately** (frees quota) | `attachments.service.ts` |
| Stuck job | `processing` for over 10 min -> `failed` / `STALLED` (runs with the 30-min storage sweep) | `sweepStalled` |
| `/chat` ids | optional `attachmentIds` (1-5 uuids, no duplicates); needs `conversationId`; last message must be a user turn | `chat.schema.ts` |
| `/chat` ownership | id must be yours, in THIS conversation, status `ready`; foreign / other-conversation / missing all answer `404 ATTACHMENT_NOT_FOUND`; not ready or failed `409 ATTACHMENT_NOT_READY`; audio or oversize/invalid image `400 ATTACHMENT_UNSUPPORTED`; >5 `400 TOO_MANY_ATTACHMENTS` | `chat-attachments.service.ts` |
| Vision | an image on a model with `supports_vision = false` (and no `vision` category) is `400 VISION_NOT_SUPPORTED`, never silently dropped | `chat-attachments.service.ts` |
| Image in chat | max **5 MiB**, max 8,000 px per side and 40 MP; metadata stripped (EXIF incl. GPS, XMP, IPTC, comments, text chunks; JPEG keeps only the orientation). **Pixels are not re-encoded** (no native library on purpose), so this is weaker than a real re-encode | `image-sanitize.ts` |
| Document in prompt | text goes inside a delimited **untrusted document** block (random per-request marker, header says it is data), in the USER turn, after history compaction. The saved chat row is only the text the user typed | `gateway.service.ts`, `chat-attachments.policy.ts` |
| Fit to the window | text is cut so prompt + reserve (min of output cap, 8,192 tokens, 25% of window) fits 95% of the window; the block says when it was shortened; no room at all -> `400 CONTEXT_TOO_LONG` | `documentCharBudget` |
| Pre-send estimate | counts the attachment text, plus **1,600 tokens per image** (a flat, conservative allowance: the gate only). The real bill is the provider's `prompt_tokens`, ledger unchanged | `CHAT_ATTACHMENT_LIMITS` |
| No request is half-saved | attachments are resolved BEFORE the conversation/user-row insert: a rejected request leaves no user message | `gateway.service.ts` |
| Deletion cascade | when the storage sweep removes an object (conversation/account deleted, orphan), the extracted text is cleared and the row becomes `failed` / `OBJECT_DELETED` | `storage.service.ts` |

`errorCode` values: `TYPE_MISMATCH`, `CORRUPT` (also password-protected PDFs), `NO_TEXT` (scanned PDF, empty file), `TOO_COMPLEX`,
`TIMEOUT`, `MEMORY`, `DOWNLOAD_FAILED`, `EXTRACT_FAILED`, `OBJECT_DELETED`, `STALLED`.
Known limits: a file is used only in the turn whose request carries its id (no link to earlier messages), so a follow-up question needs the id again and pays for the file's tokens again; no OCR; `.txt` must be UTF-8 (Windows-1256 files are rejected as `TYPE_MISMATCH`); DOCX text comes from the main document only (no headers/footers/footnotes).

## 3. Where it works (important)

The tRPC router is shared by the api (Render) and the Next.js app (Vercel). The Supabase service key exists **only on Render**, so
`attachments.*` answers `SERVICE_UNAVAILABLE` / `STORAGE_DISABLED` when called through Vercel (`/api/trpc/...`). Call the **api host**
(`https://<your-render-service>/trpc/...`) for the checks below. How the browser will reach these procedures is a P6.3 decision, see the plan.

## 4. Verify by hand (owner; nothing here was run by me)

You need: the api base URL, a session token, and a conversation id.
- Token: sign in on the site, then in the Supabase SQL editor: `select token from sessions where user_id = '<your user id>' and expires_at > now() order by created_at desc limit 1;`
  (your user id: `select id from users where email = '<your email>';`). Treat the token like a password; delete nothing, just do not paste it anywhere.
- Conversation id: `select id from conversations where user_id = '<your user id>' and deleted_at is null order by created_at desc limit 1;`

```bash
API=https://<your-render-service>.onrender.com
TOKEN=<session token>
CONV=<conversation id>
FILE=./test.pdf                     # any small text PDF
SIZE=$(wc -c < "$FILE" | tr -d ' ')

# 1. ask for an upload URL
curl -s -X POST "$API/trpc/attachments.createUploadUrl" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"conversationId\":\"$CONV\",\"fileName\":\"test.pdf\",\"mimeType\":\"application/pdf\",\"sizeBytes\":$SIZE}"
# -> {"result":{"data":{"attachmentId":"...","uploadUrl":"https://...","mimeType":"application/pdf",...}}}
ID=<attachmentId>;  URL='<uploadUrl>'

# 2. upload the bytes to the signed URL (Supabase accepts a raw PUT body with the file's Content-Type)
curl -s -X PUT "$URL" -H 'Content-Type: application/pdf' --data-binary "@$FILE"

# 3. confirm (queues extraction)
curl -s -X POST "$API/trpc/attachments.confirm" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"attachmentId\":\"$ID\"}"

# 4. poll; status goes processing -> ready within a few seconds
curl -s -G "$API/trpc/attachments.get" -H "Authorization: Bearer $TOKEN" --data-urlencode "input={\"attachmentId\":\"$ID\"}"
```
Pass: `status: "ready"`, `textChars` > 0 and `preview` shows the start of your PDF's text.
(If the PUT in step 2 is rejected, open the `uploadUrl` response body: Supabase may want `multipart/form-data` with a `file` field instead; send me the response.)

Negative checks:
1. **Corrupt file:** `printf '%%PDF-1.4 not a pdf' > bad.pdf`, repeat steps 1-4 with it -> `status: "failed"`, `errorCode: "CORRUPT"`. In Supabase Storage the object is gone.
2. **Wrong type:** upload a PDF but declare `"mimeType":"image/png"` -> `failed` / `TYPE_MISMATCH`.
3. **Not allowed:** `"mimeType":"application/zip"` -> HTTP 415 and message `INVALID_MIME`. `"sizeBytes": 21000000` -> HTTP 400 (input bound).
4. **Someone else's id:** another account's token on `attachments.get` with your id -> `NOT_FOUND`.
5. **Cascade (covers STORAGE.md section 4 step 4):** delete that conversation in the app; within ~30 min `attachments.get` shows `failed` / `OBJECT_DELETED`, `preview: null`, and the object is gone from Storage.
6. SQL: no text left behind: `select count(*) from attachments where status <> 'ready' and extracted_text is not null;` must be `0`.

## 5. Watching it

- Render log: `[worker] extractAttachment failed: ...` (infra error only; a bad file is just a `failed` row). Also goes to Sentry (`job=extractAttachment`).
- Failure mix: `select error_code, count(*) from attachments where status = 'failed' group by 1 order by 2 desc;`
  Many `TIMEOUT` / `MEMORY` -> raise the limits in `attachments.policy.ts` only after looking at the files; many `DOWNLOAD_FAILED` -> Supabase status or key.
- Stuck: `select id, created_at from attachments where status = 'processing' and updated_at < now() - interval '15 minutes';` (the sweep fails them; a non-empty result that stays non-empty means the storage sweep is not running).
- Upstash: each upload adds a few Redis commands (one job). Watch the free-plan counter (see REDIS_POLICY.md).

## 6. Turn it off / roll back

Redeploy the previous api image: the procedures and the `extractAttachment` job disappear; queued jobs with that name log `Unknown report job`.
The `attachments` table is harmless to keep. Removing the Supabase env vars also switches it off (procedures answer `STORAGE_DISABLED`).
