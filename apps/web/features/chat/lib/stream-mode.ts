/**
 * apps/web/features/chat/lib/stream-mode.ts
 *
 * The media type the web client sends in `Accept` to ask the api for the structured v2 stream (thinking
 * block, status line). Whether to ask is decided by the admin's Thinking switch (hooks/use-feature-flags.ts,
 * passed to useChatStream as `streamV2`); the per-browser localStorage flag that used to live here was
 * removed in P6.3e.
 */

/** The exact media type the api negotiates on (apps/api services/stream-v2.ts). */
export const STREAM_V2_MEDIA_TYPE = "application/vnd.aip.stream+v2";
