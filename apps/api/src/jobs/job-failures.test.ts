import { describe, it, expect, vi } from "vitest";
import { createFailureTracker, attachJobFailureTracking } from "./job-failures";

function setup(over: Partial<Parameters<typeof createFailureTracker>[0]> = {}) {
  let t = 1_000_000;
  const count = vi.fn();
  const alert = vi.fn();
  const tracker = createFailureTracker({ count, alert, now: () => t, ...over });
  return { tracker, count, alert, advance: (ms: number) => { t += ms; } };
}

describe("job failure tracker (P2.3)", () => {
  it("counts every failed attempt per queue", () => {
    const { tracker, count } = setup();
    tracker.record("email");
    tracker.record("reports");
    expect(count).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenNthCalledWith(1, "email");
    expect(count).toHaveBeenNthCalledWith(2, "reports");
  });

  it("does not alert below the burst threshold", () => {
    const { tracker, alert } = setup();
    for (let i = 0; i < 4; i++) tracker.record("email");
    expect(alert).not.toHaveBeenCalled();
  });

  it("alerts once at the threshold and stays quiet during the cooldown", () => {
    const { tracker, alert, advance } = setup();
    for (let i = 0; i < 20; i++) { tracker.record("email"); advance(1_000); }
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toContain('queue "email"');
  });

  it("alerts again after the cooldown if failures continue", () => {
    const { tracker, alert, advance } = setup();
    for (let i = 0; i < 5; i++) tracker.record("email");
    expect(alert).toHaveBeenCalledTimes(1);
    advance(16 * 60_000);
    for (let i = 0; i < 5; i++) tracker.record("email");
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("failures older than the window do not add up to a burst", () => {
    const { tracker, alert, advance } = setup();
    for (let i = 0; i < 4; i++) { tracker.record("email"); advance(2 * 60_000); }
    expect(alert).not.toHaveBeenCalled();
  });

  it("queues are tracked independently", () => {
    const { tracker, alert } = setup();
    for (let i = 0; i < 3; i++) { tracker.record("email"); tracker.record("reports"); }
    expect(alert).not.toHaveBeenCalled();
  });

  it("counts but never alerts for the alerts queue itself (no alert loop)", () => {
    const { tracker, alert, count } = setup();
    for (let i = 0; i < 50; i++) tracker.record("alerts");
    expect(count).toHaveBeenCalledTimes(50);
    expect(alert).not.toHaveBeenCalled();
  });

  it("never throws even if the metric or the alert callback throws", () => {
    const { tracker } = setup({
      count: () => { throw new Error("metric boom"); },
    });
    expect(() => tracker.record("email")).not.toThrow();
    const b = setup({ alert: () => { throw new Error("alert boom"); } });
    expect(() => { for (let i = 0; i < 6; i++) b.tracker.record("email"); }).not.toThrow();
  });

  it("alert text never contains job data (only queue name and counts)", () => {
    const { tracker, alert } = setup();
    for (let i = 0; i < 5; i++) tracker.record("email");
    expect(alert.mock.calls[0]![0]).toMatch(/^Failed-job burst: 5 failures in 5 min on queue "email"\./);
  });

  it("attachJobFailureTracking wires the worker 'failed' event", () => {
    const handlers: Record<string, () => void> = {};
    const worker = { on: (ev: string, fn: () => void) => { handlers[ev] = fn; } };
    const record = vi.fn();
    attachJobFailureTracking(worker, "email", { record });
    handlers["failed"]!();
    expect(record).toHaveBeenCalledWith("email");
  });
});
