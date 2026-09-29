import { describe, it, expect, vi } from "vitest";
import { createErrorRatioWatch, createCountWatch } from "./alert-rules";
import { setSignalHandlers, signalUpstreamCall, signalDeductionFailure } from "./alert-hook";
import { installAlertSignals } from "./alert-wiring";

const clock = () => { let t = 1_000_000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };

describe("provider error-ratio watch (ProviderAllChannelsFailed)", () => {
  it("ignores tiny samples (1 of 1 failing is not an outage)", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createErrorRatioWatch({ onTrip, now: c.now });
    for (let i = 0; i < 4; i++) w.record("openai", false);
    expect(onTrip).not.toHaveBeenCalled();
  });
  it("trips when >50% of >=5 recent calls failed, once per cooldown", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createErrorRatioWatch({ onTrip, now: c.now });
    for (let i = 0; i < 12; i++) { w.record("openai", false); c.advance(1_000); }
    expect(onTrip).toHaveBeenCalledTimes(1);
    expect(onTrip.mock.calls[0]![0]).toBe("openai");
  });
  it("healthy traffic with occasional errors does not trip", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createErrorRatioWatch({ onTrip, now: c.now });
    for (let i = 0; i < 40; i++) { w.record("openai", i % 5 !== 0); c.advance(1_000); }
    expect(onTrip).not.toHaveBeenCalled();
  });
  it("providers are independent", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createErrorRatioWatch({ onTrip, now: c.now });
    for (let i = 0; i < 6; i++) { w.record("a", true); w.record("b", false); }
    expect(onTrip).toHaveBeenCalledTimes(1);
    expect(onTrip.mock.calls[0]![0]).toBe("b");
  });
  it("re-alerts after the cooldown if still failing", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createErrorRatioWatch({ onTrip, now: c.now });
    for (let i = 0; i < 6; i++) w.record("a", false);
    c.advance(16 * 60_000);
    for (let i = 0; i < 6; i++) w.record("a", false);
    expect(onTrip).toHaveBeenCalledTimes(2);
  });
  it("never throws if onTrip throws", () => {
    const w = createErrorRatioWatch({ onTrip: () => { throw new Error("x"); } });
    expect(() => { for (let i = 0; i < 8; i++) w.record("a", false); }).not.toThrow();
  });
});

describe("deduction count watch (BalanceDeductionFailing)", () => {
  it("trips above 5 in a minute, not at 5", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createCountWatch({ onTrip, now: c.now });
    for (let i = 0; i < 5; i++) w.record();
    expect(onTrip).not.toHaveBeenCalled();
    w.record();
    expect(onTrip).toHaveBeenCalledTimes(1);
  });
  it("slow trickle (1 per 30 s) never trips", () => {
    const onTrip = vi.fn(); const c = clock();
    const w = createCountWatch({ onTrip, now: c.now });
    for (let i = 0; i < 30; i++) { w.record(); c.advance(30_000); }
    expect(onTrip).not.toHaveBeenCalled();
  });
});

describe("signal seam + wiring", () => {
  it("is a no-op with no handlers and never throws", () => {
    setSignalHandlers(null);
    expect(() => { signalUpstreamCall("a", false); signalDeductionFailure(); }).not.toThrow();
  });
  it("a throwing handler never escapes to the billing/gateway code", () => {
    setSignalHandlers({ upstreamCall: () => { throw new Error("x"); }, deductionFailure: () => { throw new Error("y"); } });
    expect(() => { signalUpstreamCall("a", false); signalDeductionFailure(); }).not.toThrow();
    setSignalHandlers(null);
  });
  it("installAlertSignals turns 6 failed deductions into one critical alert", () => {
    const alert = vi.fn();
    installAlertSignals(alert);
    for (let i = 0; i < 8; i++) signalDeductionFailure();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![1]).toBe("critical");
    setSignalHandlers(null);
  });
  it("installAlertSignals turns a failing provider into one critical alert naming it", () => {
    const alert = vi.fn();
    installAlertSignals(alert);
    for (let i = 0; i < 8; i++) signalUpstreamCall("anthropic", false);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toContain('"anthropic"');
    setSignalHandlers(null);
  });
});
