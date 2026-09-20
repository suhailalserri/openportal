import { describe, it, expect } from "vitest";

import {
  POINTER_TARGET_HOVER,
  POINTER_TARGET_PRESSED,
  createDots,
  dotCountFor,
  easePointer,
  linkAlpha,
  linkDistanceFor,
  mulberry32,
  pointerRadiusFor,
  resizeDots,
  stepDots,
  type Dot,
  type Pointer,
} from "./constellation";

const W = 800;
const H = 500;
const FRAME = 1000 / 60;

function field(n = 60, seed = 7): Dot[] {
  return createDots(n, W, H, mulberry32(seed));
}

function run(dots: Dot[], frames: number, pointer: Pointer | null, radius = 220): void {
  for (let i = 0; i < frames; i++) {
    if (pointer) easePointer(pointer, FRAME);
    stepDots(dots, FRAME, W, H, pointer, { pointerRadius: radius });
  }
}

const avgDistTo = (dots: Dot[], x: number, y: number): number =>
  dots.reduce((s, d) => s + Math.hypot(d.x - x, d.y - y), 0) / dots.length;

describe("mulberry32", () => {
  it("is deterministic for a seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("differs between seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("dotCountFor — the slow-phone guard", () => {
  it("returns 0 for an empty/invalid frame", () => {
    expect(dotCountFor(0, 500)).toBe(0);
    expect(dotCountFor(500, 0)).toBe(0);
    expect(dotCountFor(Number.NaN, 500)).toBe(0);
    expect(dotCountFor(-5, 500)).toBe(0);
  });
  it("is hard-capped on desktop", () => {
    expect(dotCountFor(4000, 3000)).toBe(90);
  });
  it("is capped lower on a phone-width screen", () => {
    expect(dotCountFor(360, 4000)).toBe(55);
    expect(dotCountFor(639, 9999)).toBe(55);
  });
  it("never goes below the minimum for a tiny valid frame", () => {
    expect(dotCountFor(100, 100)).toBe(24);
  });
  it("grows with area between the bounds", () => {
    expect(dotCountFor(900, 600)).toBeGreaterThan(dotCountFor(500, 400));
  });
});

describe("responsive helpers", () => {
  it("use tighter links and a smaller pointer radius on phones", () => {
    expect(linkDistanceFor(360)).toBeLessThan(linkDistanceFor(1280));
    expect(pointerRadiusFor(360)).toBeLessThan(pointerRadiusFor(1280));
  });
});

describe("linkAlpha", () => {
  it("is zero at and beyond the link distance", () => {
    expect(linkAlpha(120, 120)).toBe(0);
    expect(linkAlpha(500, 120)).toBe(0);
  });
  it("is strongest when dots touch and never exceeds max", () => {
    expect(linkAlpha(0, 120)).toBeCloseTo(0.28, 10);
    expect(linkAlpha(0, 120, 0.5)).toBeCloseTo(0.5, 10);
  });
  it("fades monotonically with distance", () => {
    expect(linkAlpha(20, 120)).toBeGreaterThan(linkAlpha(60, 120));
    expect(linkAlpha(60, 120)).toBeGreaterThan(linkAlpha(110, 120));
  });
});

describe("createDots / resizeDots", () => {
  it("creates the requested count, all inside the frame", () => {
    const dots = field(80);
    expect(dots).toHaveLength(80);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(W);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(H);
    }
  });
  it("is reproducible from a seed", () => {
    expect(field(30, 5)).toEqual(field(30, 5));
  });
  it("mixes gold and white dots", () => {
    const dots = field(90);
    const gold = dots.filter((d) => d.gold).length;
    expect(gold).toBeGreaterThan(0);
    expect(gold).toBeLessThan(90);
  });
  it("grows, shrinks, and pulls strays back inside on resize", () => {
    const dots = field(40);
    const grown = resizeDots(dots, 60, 300, 200, mulberry32(9));
    expect(grown).toHaveLength(60);
    const shrunk = resizeDots(grown, 10, 300, 200, mulberry32(9));
    expect(shrunk).toHaveLength(10);
    for (const d of grown) {
      expect(d.x).toBeLessThanOrEqual(300);
      expect(d.y).toBeLessThanOrEqual(200);
    }
  });
});

describe("stepDots — free drift", () => {
  it("keeps every dot inside the frame over a long run", () => {
    const dots = field(80, 11);
    run(dots, 2000, null);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(W);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(H);
    }
  });
  it("actually moves the dots", () => {
    const dots = field(20, 3);
    const before = dots.map((d) => ({ x: d.x, y: d.y }));
    run(dots, 60, null);
    const moved = dots.filter((d, i) => Math.hypot(d.x - before[i]!.x, d.y - before[i]!.y) > 0.5);
    expect(moved.length).toBeGreaterThan(15);
  });
  it("never lets a dot exceed the speed cap", () => {
    const dots = field(60, 2);
    const p: Pointer = { x: 400, y: 250, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 300, p);
    for (const d of dots) expect(Math.hypot(d.vx, d.vy)).toBeLessThanOrEqual(4 + 1e-9);
  });
  it("does nothing for a zero or negative time step", () => {
    const dots = field(10, 4);
    const snap = JSON.stringify(dots);
    stepDots(dots, 0, W, H, null, { pointerRadius: 220 });
    stepDots(dots, -16, W, H, null, { pointerRadius: 220 });
    expect(JSON.stringify(dots)).toBe(snap);
  });
});

describe("stepDots — a backgrounded tab resuming", () => {
  it("clamps a huge gap so dots cannot teleport across the frame", () => {
    const dots = field(40, 8);
    const before = dots.map((d) => ({ x: d.x, y: d.y }));
    stepDots(dots, 10 * 60 * 1000, W, H, null, { pointerRadius: 220 }); // 10 minutes
    for (let i = 0; i < dots.length; i++) {
      const moved = Math.hypot(dots[i]!.x - before[i]!.x, dots[i]!.y - before[i]!.y);
      expect(moved).toBeLessThan(15); // at most ~3 frames of motion
    }
  });
});

describe("pointer — gather and release", () => {
  const PX = 400;
  const PY = 250;

  it("gathers the dots within reach closer to the touch point", () => {
    // Only dots inside the influence radius can feel the pointer, so the
    // gather is measured on THAT population — averaging the whole field
    // dilutes it with dots that are (correctly) never pulled.
    const dots = field(80, 21);
    const reach = dots.filter((d) => Math.hypot(d.x - PX, d.y - PY) < 220);
    expect(reach.length).toBeGreaterThan(10);
    const before = avgDistTo(reach, PX, PY);
    const p: Pointer = { x: PX, y: PY, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 240, p);
    expect(avgDistTo(reach, PX, PY)).toBeLessThan(before * 0.6);
  });

  it("pulls dots from outside the radius only if they drift in (no long-range magnet)", () => {
    const outside: Dot = {
      x: 790, y: 490, vx: 0, vy: 0, bvx: 0, bvy: 0, r: 1, gold: false, ring: 30,
    };
    const p: Pointer = { x: PX, y: PY, strength: 1, target: 1 };
    const startDist = Math.hypot(outside.x - PX, outside.y - PY);
    for (let i = 0; i < 200; i++) stepDots([outside], FRAME, W, H, p, { pointerRadius: 220 });
    expect(Math.hypot(outside.x - PX, outside.y - PY)).toBeCloseTo(startDist, 6);
  });

  it("settles into a halo, not a single collapsed pixel", () => {
    const dots = field(80, 21);
    const p: Pointer = { x: PX, y: PY, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 400, p);
    const near = dots.filter((d) => Math.hypot(d.x - PX, d.y - PY) < 220);
    expect(near.length).toBeGreaterThan(5);
    const distinct = new Set(near.map((d) => `${Math.round(d.x)},${Math.round(d.y)}`));
    expect(distinct.size).toBeGreaterThan(near.length * 0.8);
  });

  it("a hover pulls less than a press", () => {
    const a = field(80, 5);
    const b = field(80, 5);
    run(a, 200, { x: PX, y: PY, strength: 0, target: POINTER_TARGET_HOVER });
    run(b, 200, { x: PX, y: PY, strength: 0, target: POINTER_TARGET_PRESSED });
    expect(avgDistTo(b, PX, PY)).toBeLessThan(avgDistTo(a, PX, PY));
  });

  it("ignores dots outside the influence radius", () => {
    const far: Dot = {
      x: 700, y: 50, vx: 0, vy: 0, bvx: 0, bvy: 0, r: 1, gold: false, ring: 30,
    };
    const p: Pointer = { x: 50, y: 450, strength: 1, target: 1 };
    stepDots([far], FRAME, W, H, p, { pointerRadius: 100 });
    expect(far.x).toBeCloseTo(700, 6);
    expect(far.y).toBeCloseTo(50, 6);
  });

  it("returns to free drift after release: strength decays to exactly 0", () => {
    const dots = field(60, 13);
    const p: Pointer = { x: PX, y: PY, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 120, p);
    expect(p.strength).toBeGreaterThan(0.9);
    p.target = 0;
    run(dots, 600, p);
    expect(p.strength).toBe(0);
  });

  it("lets the halo dissolve after release (dots resume their own drift)", () => {
    const dots = field(80, 21);
    const p: Pointer = { x: PX, y: PY, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 400, p);
    const haloCount = () =>
      dots.filter((d) => Math.hypot(d.x - PX, d.y - PY) < 70).length;
    const gathered = haloCount();
    expect(gathered).toBeGreaterThan(8); // a real halo formed
    p.target = 0;
    run(dots, 1500, p);
    // Free drift scatters them again: far fewer sit tight around the point.
    expect(haloCount()).toBeLessThan(gathered * 0.6);
  });

  it("after release each dot's velocity relaxes back toward its own drift", () => {
    const dots = field(60, 13);
    const p: Pointer = { x: PX, y: PY, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 200, p);
    p.target = 0;
    run(dots, 1500, p);
    let closeToDrift = 0;
    for (const d of dots) {
      if (Math.hypot(d.vx - d.bvx, d.vy - d.bvy) < 0.05) closeToDrift++;
    }
    expect(closeToDrift).toBeGreaterThan(dots.length * 0.9);
  });

  it("stays inside the frame while gathered at a corner", () => {
    const dots = field(80, 33);
    const p: Pointer = { x: 0, y: 0, strength: 0, target: POINTER_TARGET_PRESSED };
    run(dots, 400, p);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(d.x + d.y + d.vx + d.vy)).toBe(true);
    }
  });

  it("a pointer sitting exactly on a dot does not produce NaN", () => {
    const d: Dot = { x: 100, y: 100, vx: 0.1, vy: 0.1, bvx: 0.1, bvy: 0.1, r: 1, gold: true, ring: 20 };
    const p: Pointer = { x: 100, y: 100, strength: 1, target: 1 };
    stepDots([d], FRAME, W, H, p, { pointerRadius: 220 });
    expect(Number.isFinite(d.x)).toBe(true);
    expect(Number.isFinite(d.y)).toBe(true);
  });
});

describe("easePointer", () => {
  it("rises toward the target and never overshoots", () => {
    const p: Pointer = { x: 0, y: 0, strength: 0, target: 1 };
    let last = 0;
    for (let i = 0; i < 200; i++) {
      easePointer(p, FRAME);
      expect(p.strength).toBeGreaterThanOrEqual(last);
      expect(p.strength).toBeLessThanOrEqual(1);
      last = p.strength;
    }
  });
  it("rises faster than it falls (gather is immediate, release is soft)", () => {
    const up: Pointer = { x: 0, y: 0, strength: 0, target: 1 };
    const down: Pointer = { x: 0, y: 0, strength: 1, target: 0 };
    for (let i = 0; i < 10; i++) {
      easePointer(up, FRAME);
      easePointer(down, FRAME);
    }
    expect(up.strength).toBeGreaterThan(1 - down.strength);
  });
  it("ignores a non-positive time step", () => {
    const p: Pointer = { x: 0, y: 0, strength: 0.3, target: 1 };
    easePointer(p, 0);
    easePointer(p, -10);
    expect(p.strength).toBe(0.3);
  });
});
