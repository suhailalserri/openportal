import { describe, it, expect } from "vitest";
import * as web from "./config";
import * as shared from "@ai-platform/config/monitoring-scrub";

/**
 * P2.1: "share one scrubbing list with the web config". The web module must
 * re-export the SAME functions the api uses, not a copy that can drift.
 */
describe("web monitoring config uses the shared scrub module", () => {
  it("re-exports identical implementations", () => {
    expect(web.scrubEvent).toBe(shared.scrubEvent);
    expect(web.redactText).toBe(shared.redactText);
    expect(web.scrubUrl).toBe(shared.scrubUrl);
    expect(web.shouldIgnoreError).toBe(shared.shouldIgnoreError);
    expect(web.IGNORED_TRPC_CODES).toBe(shared.IGNORED_TRPC_CODES);
  });

  it("web beforeSend now also drops `extra` and redacts API keys / bcrypt hashes", () => {
    const out = web.beforeSend(
      { extra: { prompt: "P" }, message: "k sk-aip-" + "A".repeat(24) },
      { originalException: new Error("x") }
    ) as { extra?: unknown; message: string };
    expect(out.extra).toBeUndefined();
    expect(out.message).toBe("k [key]");
  });
});
