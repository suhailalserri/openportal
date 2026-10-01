import { describe, it, expect } from "vitest";

import {
  availabilityHintKey, createReadyMemory, initialAvailability, nextAvailability, probeAvailability,
  type AvailabilityState, type ProbeResult,
} from "./availability";

function res(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}
const noSleep = async () => {};

function scripted(answers: Array<Response | Error>): { fetchImpl: typeof fetch; calls: () => number } {
  let n = 0;
  const fetchImpl = (async () => {
    const a = answers[Math.min(n, answers.length - 1)]!;
    n += 1;
    if (a instanceof Error) throw a;
    return a.clone();
  }) as typeof fetch;
  return { fetchImpl, calls: () => n };
}

describe("probeAvailability", () => {
  it("is available on {available:true} after one call", async () => {
    const s = scripted([res(200, { available: true })]);
    expect(await probeAvailability("/x", s.fetchImpl, { sleep: noSleep })).toEqual({ available: true });
    expect(s.calls()).toBe(1);
  });

  it("treats {available:false} as a final notConfigured, with no retry", async () => {
    const s = scripted([res(200, { available: false })]);
    const r = await probeAvailability("/x", s.fetchImpl, { sleep: noSleep });
    expect(r).toEqual({ available: false, reason: "notConfigured", code: "NOT_AVAILABLE" });
    expect(s.calls()).toBe(1);
  });

  it("treats a 401 as signedOut, with no retry", async () => {
    const s = scripted([res(401, { error: "UNAUTHORIZED" })]);
    const r = await probeAvailability("/x", s.fetchImpl, { sleep: noSleep });
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe("signedOut");
    expect(s.calls()).toBe(1);
  });

  it("retries a transient failure and succeeds on the third attempt", async () => {
    const s = scripted([new Error("offline"), res(502, { error: "UPSTREAM_UNREACHABLE" }), res(200, { available: true })]);
    expect(await probeAvailability("/x", s.fetchImpl, { sleep: noSleep })).toEqual({ available: true });
    expect(s.calls()).toBe(3);
  });

  it("gives up after three attempts as unreachable and keeps the last code", async () => {
    const s = scripted([res(500, { error: "CONFIG_ERROR" })]);
    const r = await probeAvailability("/x", s.fetchImpl, { sleep: noSleep });
    expect(r).toEqual({ available: false, reason: "unreachable", code: "CONFIG_ERROR" });
    expect(s.calls()).toBe(3);
  });

  it("waits the backoff between attempts", async () => {
    const waits: number[] = [];
    const s = scripted([res(500, "<html>")]);
    await probeAvailability("/x", s.fetchImpl, { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([1000, 3000]);
  });

  it("stops retrying once aborted", async () => {
    const ctrl = new AbortController();
    const s = scripted([res(500, { error: "CONFIG_ERROR" })]);
    const r = await probeAvailability("/x", s.fetchImpl, { sleep: async () => ctrl.abort(), signal: ctrl.signal });
    expect(s.calls()).toBe(1);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.code).toBe("ABORTED");
  });

  it("does not crash on a JSON null body", async () => {
    const s = scripted([res(200, "null")]);
    const r = await probeAvailability("/x", s.fetchImpl, { sleep: noSleep });
    expect(r.available).toBe(false);
  });
});

describe("nextAvailability", () => {
  const ready: AvailabilityState = { phase: "ready" };
  const unreachable: ProbeResult = { available: false, reason: "unreachable", code: "NETWORK" };

  it("keeps a ready feature through a transient failure", () => {
    expect(nextAvailability(ready, unreachable)).toBe(ready);
  });
  it("but not when asked to be strict (the admin readiness line)", () => {
    expect(nextAvailability(ready, unreachable, false)).toEqual({ phase: "unavailable", reason: "unreachable", code: "NETWORK" });
  });
  it("a definite no always wins, even over ready", () => {
    expect(nextAvailability(ready, { available: false, reason: "notConfigured", code: "NOT_AVAILABLE" }).phase).toBe("unavailable");
    expect(nextAvailability(ready, { available: false, reason: "signedOut", code: "UNAUTHORIZED" }).phase).toBe("unavailable");
  });
  it("a failure while still checking becomes unavailable, and a success becomes ready", () => {
    expect(nextAvailability({ phase: "checking" }, unreachable).phase).toBe("unavailable");
    expect(nextAvailability({ phase: "unavailable", reason: "unreachable", code: "X" }, { available: true })).toEqual({ phase: "ready" });
  });
});

describe("ready memory", () => {
  it("remembers for the ttl, then forgets", () => {
    let t = 0;
    const m = createReadyMemory(1000, () => t);
    expect(m.wasReady("a")).toBe(false);
    m.remember("a");
    t = 999;
    expect(m.wasReady("a")).toBe(true);
    t = 1000;
    expect(m.wasReady("a")).toBe(false);
  });
  it("forget removes it, keys are independent", () => {
    const m = createReadyMemory(1000, () => 0);
    m.remember("a");
    m.remember("b");
    m.forget("a");
    expect(m.wasReady("a")).toBe(false);
    expect(m.wasReady("b")).toBe(true);
  });
  it("seeds the initial state", () => {
    expect(initialAvailability(true)).toEqual({ phase: "ready" });
    expect(initialAvailability(false)).toEqual({ phase: "checking" });
  });
});

describe("availabilityHintKey", () => {
  it("maps every reason for both features", () => {
    expect(availabilityHintKey("attach", "notConfigured")).toBe("attachUnavailable");
    expect(availabilityHintKey("attach", "unreachable")).toBe("attachUnreachable");
    expect(availabilityHintKey("voice", "notConfigured")).toBe("voiceUnavailable");
    expect(availabilityHintKey("voice", "unreachable")).toBe("voiceUnreachable");
    expect(availabilityHintKey("voice", "signedOut")).toBe("featureSignedOut");
    expect(availabilityHintKey("attach", "signedOut")).toBe("featureSignedOut");
  });
});
