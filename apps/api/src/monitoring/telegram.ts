/**
 * apps/api/src/monitoring/telegram.ts (plan P2.2)
 *
 * The ONE Telegram sender. Used by the alert worker, the Redis-down fallback
 * (deliver-alert.ts), fraud alerts and the Sentry webhook relay.
 *
 * - PLAIN TEXT (no parse_mode). The old worker used Markdown; an underscore or
 *   asterisk in a dynamic message makes Telegram answer 400 and the alert was
 *   silently lost.
 * - Text goes through the shared redactText (emails, bearer tokens, API keys,
 *   bcrypt hashes, redeem codes) and is capped below Telegram's 4096 limit.
 * - Bounded by a timeout; NEVER throws (L12). Returns whether it was sent.
 */
import { redactText } from "@ai-platform/config/monitoring-scrub";

export type AlertLevel = "info" | "warning" | "critical";
const EMOJI: Record<AlertLevel, string> = { critical: "🚨", warning: "⚠️", info: "ℹ️" };
const MAX_LEN = 3500;

export function formatAlert(message: string, level: AlertLevel, timestamp = new Date().toISOString()): string {
  const body = redactText(message);
  const clipped = body.length > MAX_LEN ? `${body.slice(0, MAX_LEN)}…` : body;
  return `${EMOJI[level]} AI Platform [api]\n\n${clipped}\n\n${timestamp}`;
}

export interface SendResult { ok: boolean; configured: boolean; status?: number }

export async function sendTelegram(
  message: string,
  level: AlertLevel = "info",
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<SendResult> {
  const env = opts.env ?? process.env;
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, configured: false };
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatAlert(message, level), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 4_000),
    });
    return { ok: res.ok, configured: true, status: res.status };
  } catch {
    return { ok: false, configured: true };
  }
}
