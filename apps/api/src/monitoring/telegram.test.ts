import { describe, it, expect, vi } from "vitest";
import { sendTelegram, formatAlert } from "./telegram";
import { deliverAlert } from "./deliver-alert";

const env = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "42" } as NodeJS.ProcessEnv;

describe("sendTelegram", () => {
  it("no env => not configured, no fetch, no throw", async () => {
    const f = vi.fn();
    const r = await sendTelegram("x", "info", { env: {} as NodeJS.ProcessEnv, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, configured: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("sends plain text (no parse_mode) to the bot API", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200 }));
    const r = await sendTelegram("hello_world *bold*", "critical", { env, fetchImpl: f as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("42");
    expect(body.parse_mode).toBe(undefined);
    expect(body.text).toContain("hello_world *bold*");
  });
  it("HTTP error and network error are results, never exceptions", async () => {
    const bad = vi.fn(async () => ({ ok: false, status: 400 }));
    expect((await sendTelegram("x", "info", { env, fetchImpl: bad as unknown as typeof fetch })).status).toBe(400);
    const boom = vi.fn(async () => { throw new Error("network"); });
    expect((await sendTelegram("x", "info", { env, fetchImpl: boom as unknown as typeof fetch })).ok).toBe(false);
  });
  it("redacts emails, bearer tokens and API keys before sending", () => {
    const t = formatAlert("user a.b@example.com Bearer abc.def.ghi key sk-ant-abcdefghijklmnop1234", "warning");
    expect(t).toContain("[email]");
    expect(t).toContain("Bearer [redacted]");
    expect(t).toContain("[key]");
    expect(t.includes("example.com")).toBe(false);
  });
  it("caps very long messages below Telegram's 4096 limit", () => {
    expect(formatAlert("a".repeat(10_000), "info").length < 4000).toBe(true);
  });
});

describe("deliverAlert (Redis-down fallback)", () => {
  it("queue ok => queued, no direct send", async () => {
    const sendDirect = vi.fn(async () => {});
    expect(await deliverAlert({ enqueue: async () => 1, sendDirect })).toBe("queued");
    expect(sendDirect).not.toHaveBeenCalled();
  });
  it("queue throws => direct send", async () => {
    const sendDirect = vi.fn(async () => {});
    expect(await deliverAlert({ enqueue: async () => { throw new Error("ECONNREFUSED"); }, sendDirect })).toBe("direct");
    expect(sendDirect).toHaveBeenCalledTimes(1);
  });
  it("queue hangs (Redis unreachable) => direct send after the deadline", async () => {
    const sendDirect = vi.fn(async () => {});
    const r = await deliverAlert({ enqueue: () => new Promise(() => {}), sendDirect, timeoutMs: 30 });
    expect(r).toBe("direct");
  });
  it("both fail => 'failed', never throws", async () => {
    const r = await deliverAlert({
      enqueue: async () => { throw new Error("a"); },
      sendDirect: async () => { throw new Error("b"); },
    });
    expect(r).toBe("failed");
  });
});
