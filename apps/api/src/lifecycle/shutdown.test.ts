import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  createShutdownController,
  installShutdownSignalHandlers,
  shutdownTimingFromEnv,
  SHUTDOWN_DEFAULTS,
  type ShutdownCloser,
} from "./shutdown";

function setup(over: { closers?: ShutdownCloser[]; onAbort?: (n: number) => void } = {}) {
  const exit = vi.fn();
  const logs: string[] = [];
  const controller = createShutdownController({
    drainMs: 90_000,
    abortGraceMs: 15_000,
    closerTimeoutMs: 3_000,
    hardExitMs: 117_000,
    closers: () => over.closers ?? [],
    exit,
    log: (_l, m) => logs.push(m),
    onAbort: over.onAbort,
  });
  return { controller, exit, logs };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("shutdown controller: drain", () => {
  it("exits 0 as soon as in-flight operations finish, without aborting them", async () => {
    const closed: string[] = [];
    const { controller, exit } = setup({ closers: [{ name: "a", close: () => { closed.push("a"); } }] });
    const op = controller.beginOperation()!;
    const done = controller.shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(30_000);
    expect(exit).not.toHaveBeenCalled();
    expect(op.signal.aborted).toBe(false);

    op.end();
    await done;
    expect(closed).toEqual(["a"]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(op.signal.aborted).toBe(false);
  });

  it("exits immediately (after closers) when nothing is in flight", async () => {
    const { controller, exit } = setup();
    await controller.shutdown("SIGTERM");
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("rejects new operations once draining, and reports draining", async () => {
    const { controller } = setup();
    const op = controller.beginOperation()!;
    expect(controller.isDraining()).toBe(false);
    void controller.shutdown("SIGTERM");
    expect(controller.isDraining()).toBe(true);
    expect(controller.beginOperation()).toBeNull();
    op.end();
  });
});

describe("shutdown controller: deadline abort", () => {
  it("aborts remaining operations at the drain deadline, waits for them to finish billing, then exits 0", async () => {
    const onAbort = vi.fn();
    const { controller, exit } = setup({ onAbort });
    const op = controller.beginOperation()!;
    const done = controller.shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(89_999);
    expect(op.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(op.signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledWith(1);

    // streamChat now takes its partial-billing path; it finishes 2 s later.
    await vi.advanceTimersByTimeAsync(2_000);
    op.end();
    await done;
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 if an operation is still running after the abort grace", async () => {
    const { controller, exit } = setup();
    controller.beginOperation();
    const done = controller.shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(90_000 + 15_000);
    await done;
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("op.end() is idempotent", async () => {
    const { controller } = setup();
    const a = controller.beginOperation()!;
    const b = controller.beginOperation()!;
    a.end(); a.end(); a.end();
    expect(controller.inFlight()).toBe(1);
    b.end();
    expect(controller.inFlight()).toBe(0);
  });
});

describe("shutdown controller: signals and closers", () => {
  it("ignores a second SIGTERM (same promise, closers run once)", async () => {
    const close = vi.fn();
    const { controller, exit } = setup({ closers: [{ name: "a", close }] });
    const emitter = new EventEmitter();
    installShutdownSignalHandlers(controller, emitter);
    const op = controller.beginOperation()!;

    emitter.emit("SIGTERM");
    emitter.emit("SIGTERM");
    emitter.emit("SIGINT");
    expect(controller.shutdown("x")).toBe(controller.shutdown("y"));

    op.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("a throwing closer does not block the others; a hanging one times out", async () => {
    const order: string[] = [];
    const { controller, exit, logs } = setup({
      closers: [
        { name: "throws", close: () => { throw new Error("boom"); } },
        { name: "hangs",  close: () => new Promise(() => {}) },
        { name: "last",   close: () => { order.push("last"); } },
      ],
    });
    const done = controller.shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(3_000);
    await done;
    expect(order).toEqual(["last"]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logs.some((l) => l.includes('"throws" failed: boom'))).toBe(true);
    expect(logs.some((l) => l.includes('"hangs" timed out'))).toBe(true);
  });

  it("hard-exits with 1 if everything hangs past hardExitMs", async () => {
    const exit = vi.fn();
    const controller = createShutdownController({
      drainMs: 90_000, abortGraceMs: 15_000, closerTimeoutMs: 500_000, hardExitMs: 117_000,
      closers: () => [{ name: "hangs", close: () => new Promise(() => {}) }],
      exit,
    });
    void controller.shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(117_000);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("evaluates closers at shutdown time (late-created workers are included)", async () => {
    const list: ShutdownCloser[] = [];
    const exit = vi.fn();
    const controller = createShutdownController({
      drainMs: 1_000, abortGraceMs: 1_000, closerTimeoutMs: 1_000, hardExitMs: 10_000,
      closers: () => list, exit,
    });
    const late = vi.fn();
    list.push({ name: "late", close: late });
    await controller.shutdown("SIGTERM");
    expect(late).toHaveBeenCalledOnce();
  });
});

describe("shutdownTimingFromEnv", () => {
  it("uses defaults and keeps the hard exit under Render's 120 s", () => {
    const t = shutdownTimingFromEnv({});
    expect(t.drainMs).toBe(SHUTDOWN_DEFAULTS.drainMs);
    expect(t.hardExitMs).toBe(90_000 + 15_000 + 12_000);
    expect(t.hardExitMs).toBeLessThan(120_000);
  });
  it("honours valid overrides, clamps extremes, ignores garbage", () => {
    expect(shutdownTimingFromEnv({ SHUTDOWN_DRAIN_MS: "60000" }).drainMs).toBe(60_000);
    expect(shutdownTimingFromEnv({ SHUTDOWN_DRAIN_MS: "5" }).drainMs).toBe(1_000);
    expect(shutdownTimingFromEnv({ SHUTDOWN_DRAIN_MS: "9999999" }).drainMs).toBe(240_000);
    expect(shutdownTimingFromEnv({ SHUTDOWN_DRAIN_MS: "abc" }).drainMs).toBe(90_000);
    expect(shutdownTimingFromEnv({ SHUTDOWN_ABORT_GRACE_MS: "" }).abortGraceMs).toBe(15_000);
  });
});
