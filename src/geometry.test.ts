import { describe, expect, it } from "vitest";
import {
  angleDelta,
  separation,
  sweepContact,
  wrapCoord,
  wrapDelta,
  wrappedDistance,
} from "./geometry";
import { gravityAt } from "./sim";

describe("the wrapping field", () => {
  it("wraps coordinates into range", () => {
    expect(wrapCoord(1290, 1280)).toBe(10);
    expect(wrapCoord(-10, 1280)).toBe(1270);
    expect(wrapCoord(0, 720)).toBe(0);
  });

  it("brings differences into [-size/2, size/2)", () => {
    expect(wrapDelta(700, 1280)).toBe(-580);
    expect(wrapDelta(-640, 1280)).toBe(-640);
    expect(wrapDelta(640, 1280)).toBe(-640);
    expect(wrapDelta(100, 1280)).toBe(100);
  });

  it("measures the shortest separation across the seams", () => {
    expect(separation(10, 10, 1270, 710)).toEqual({ x: -20, y: -20 });
    expect(wrappedDistance(5, 360, 1275, 360)).toBe(10);
  });
});

describe("the swept contact test", () => {
  it("reports overlap at the start of a tick", () => {
    expect(sweepContact(5, 0, 0, 0, 10)).toBe(0);
  });

  it("catches a fast body passing straight through", () => {
    const t = sweepContact(-100, 0, 200, 0, 10);
    expect(t).toBeCloseTo(0.45, 6);
  });

  it("misses a body that passes wide or never arrives", () => {
    expect(sweepContact(-100, 30, 200, 0, 10)).toBe(-1);
    expect(sweepContact(-100, 0, 50, 0, 10)).toBe(-1);
    expect(sweepContact(100, 0, 0, 0, 10)).toBe(-1);
  });
});

describe("angles", () => {
  it("takes the shortest signed rotation", () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
  });
});

describe("the gravity law", () => {
  it.each([
    [200, 112.5],
    [150, 200],
    [120, 312.5],
    [90, 4_500_000 / 8100],
    [50, 4_500_000 / 8100],
  ])("pulls with the stated magnitude at d = %d", (d, a) => {
    const g = gravityAt(640 + d, 360);
    expect(Math.hypot(g.ax, g.ay)).toBeCloseTo(a, 6);
    expect(g.ax).toBeLessThan(0);
  });

  it("uses the direct vector rather than a wrapped one", () => {
    const g = gravityAt(5, 5);
    expect(g.ax).toBeGreaterThan(0);
    expect(g.ay).toBeGreaterThan(0);
  });
});
