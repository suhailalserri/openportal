# Runbook: Supabase Storage (P5.1)

Private buckets `attachments` and `audio`. Bytes live in Supabase; ownership, quotas and cleanup live in
the `storage_objects` table. **No user-facing feature yet**: P5.2 (attachments) and P5.3 (mic) call the
service. Until then this is foundation only, and with the two env vars unset the api behaves exactly as before.

## 1. Turn it on (owner, in this order)

1. **Migration first.** Supabase SQL editor (app project) -> paste `packages/db/src/migrations/0021_storage_objects.sql` -> Run. Safe to run twice.
2. **Render api -> Environment**, add both (the api only, never Vercel, never a `NEXT_PUBLIC_` name):
   - `SUPABASE_URL` = the project URL (Supabase -> Project Settings -> API), like `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the legacy `service_role` key, or a new `sb_secret_...` secret key (Project Settings -> API Keys). `sb_secret_` keys are sent in the `apikey` header only. **Not yet verified against a live project**: if boot logs `Storage buckets ready`, it works; an HTTP 401/403 in a `[storage]` warning means the key is wrong or from another project.
   - The URL's project ref must be the project where migration 0021 was run.
3. Deploy. The api creates/updates both buckets on start (private, size and type limits). Look for `Storage buckets ready` in the Render log.
   A line starting `[storage] Supabase storage disabled: configuration is ...` means a missing or malformed value; chat is unaffected.
4. Verify (section 4).

The service-role key bypasses every Supabase access rule. Treat it like `DATABASE_URL`: add it to `docs/runbooks/secret-rotation.md` rotation list; if it ever leaks, rotate it in Supabase and on Render immediately.

## 2. What it enforces

| Rule | Value | Where |
|---|---|---|
| Buckets | private; `attachments` 20 MiB, `audio` 25 MiB | bucket settings + `storage.policy.ts` |
| Allowed types | attachments: png, jpeg, webp, gif, pdf, txt, docx. audio: webm, ogg, mp4, mpeg, wav. No svg, archives, executables | both layers |
| Key | `{userId}/{conversationId}/{uuid}`, the conversation must belong to the user and not be deleted | service |
| Quotas | 200 MiB total and 30 uploads / 24 h per user | `STORAGE_LIMITS` |
| Upload confirm | object must exist and be no larger than declared | `confirmUpload` |
| Download URL | 5 min (max 15), only for confirmed objects of your own live conversation | `getDownloadUrl` |
| Orphans | never confirmed within 1 h -> deleted (at most ~1.5 h) | sweep every 30 min |
| Audio | anything older than 24 h -> deleted (P5.3 deletes right after transcription) | sweep |
| Deletion cascade | soft-deleted conversation, or self-deleted (anonymized) account -> objects deleted on the next sweep (up to ~30 min) | sweep |

The cascade is done by the sweep on purpose: the delete-account and delete-conversation routes are in the frozen zone and stay untouched.

## 3. Watching it

- Render log, every 30 min when there is work: `[scheduled] storageSweep: claimed N, removed N, failed N, purged N.`
- `failed > 0` also goes to Sentry (`job=storageSweep`). Failed rows stay `deleting` and are retried every run.
  Stuck for days? Check Supabase status and that the key is still valid.
- Rows stuck in `deleting`:  `select count(*) from storage_objects where status = 'deleting' and created_at < now() - interval '1 day';`

## 4. First-run verification (owner, once; not verified in the build sandbox)

1. Both buckets exist in Supabase -> Storage, and show as **private**.
2. Anonymous access is denied. In the SQL editor: `select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects';` should be `0`
   (no policy = no direct client access). If it is not 0, list them and remove any that mention `attachments` or `audio`.
3. `select tablename, rowsecurity from pg_tables where tablename = 'storage_objects';` -> `rowsecurity = t`.
4. After P5.2 ships: upload a small PDF, confirm it, download it, delete the conversation, and within ~30 min the object is gone from Storage.

## 5. Turn it off / roll back

Remove either env var on Render and redeploy: storage features switch off, the sweep stops registering. Existing objects stay in Supabase until you delete them by hand; the table is harmless to keep.
