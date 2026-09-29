/**
 * apps/api/src/monitoring/sentry-webhook.ts (plan P2.2)
 *
 * POST /internal/sentry-alert?token=...  : relays Sentry alert-rule webhooks to
 * Telegram. Sentry's webhook action cannot send custom headers, so the shared
 * secret is a URL token (SENTRY_WEBHOOK_TOKEN). Unset token => endpoint is off
 * (404), never open. Only a title, level, project and link are forwarded (no
 * event payload, no request data), and the text is redacted again on send.
 *
 * The payload shape differs between Sentry webhook kinds and I could not
 * capture a real one here, so extraction is deliberately tolerant and falls
 * back to a generic line with whatever link is present.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { AlertLevel } from "./telegram";

const sha = (s: string) => createHash("sha256").update(s).digest();

export function isAuthorizedSentryWebhook(provided: unknown, expected: string | undefined): boolean {
  if (!expected || expected.length < 24) return false;
  if (typeof provided !== "string" || !provided) return false;
  return timingSafeEqual(sha(provided), sha(expected));
}

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (typeof v === "object" && v !== null ? (v as Loose) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function formatSentryAlert(body: unknown): { message: string; level: AlertLevel } {
  const b = obj(body);
  const data = obj(b.data);
  const event = obj(data.event);
  const legacyEvent = obj(b.event);
  const metric = obj(data.metric_alert);

  const title =
    str(event.title) ?? str(data.description_title) ?? str(metric.title) ??
    str(legacyEvent.title) ?? str(b.message) ?? str(b.culprit) ?? "Sentry alert (unrecognised payload)";
  const url = str(event.web_url) ?? str(data.web_url) ?? str(b.url) ?? str(metric.web_url);
  const rule = str(data.triggered_rule) ?? str(b.triggered_rule) ?? str(obj(b.rule).name);
  const project = str(b.project_name) ?? str(b.project) ?? str(event.project);
  const sentryLevel = (str(event.level) ?? str(b.level) ?? "").toLowerCase();
  const level: AlertLevel =
    sentryLevel === "fatal" || sentryLevel === "critical" ? "critical" :
    sentryLevel === "info" || sentryLevel === "debug" ? "info" : "warning";

  const lines = [`Sentry: ${title.slice(0, 300)}`];
  if (rule) lines.push(`Rule: ${rule.slice(0, 120)}`);
  if (project) lines.push(`Project: ${project.slice(0, 80)}`);
  if (url) lines.push(url.slice(0, 500));
  return { message: lines.join("\n"), level };
}
