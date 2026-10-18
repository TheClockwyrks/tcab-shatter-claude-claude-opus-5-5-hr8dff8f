// Shatter — the torus the field is: wrapping, shortest separations, and the
// swept circle test every impact is resolved with (specs/field.md,
// specs/collision.md).

import { FIELD_H, FIELD_W } from "./constants";

/** Bring a coordinate into `[0, size)`. */
export function wrapCoord(v: number, size: number): number {
  const r = v % size;
  return r < 0 ? r + size : r;
}

/** Bring one axis of a difference into `[-size / 2, +size / 2)`. */
export function wrapDelta(d: number, size: number): number {
  let r = d % size;
  if (r < -size / 2) r += size;
  else if (r >= size / 2) r -= size;
  return r;
}

export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** The shortest wrapped separation from `a` to `b`. */
export function separation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Vec {
  return { x: wrapDelta(bx - ax, FIELD_W), y: wrapDelta(by - ay, FIELD_H) };
}

/** The shortest wrapped distance between two positions. */
export function wrappedDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const s = separation(ax, ay, bx, by);
  return Math.hypot(s.x, s.y);
}

/**
 * The earliest fraction of a tick, in `[0, 1]`, at which two circles moving in
 * straight lines come within `reach` of each other, or `-1` when they never do.
 *
 * `sx, sy` is the separation between the two centres at the start of the tick
 * and `dx, dy` is the displacement of the second relative to the first over it.
 */
export function sweepContact(
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  reach: number,
): number {
  const c = sx * sx + sy * sy - reach * reach;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (sx * dx + sy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** The signed smallest rotation from angle `from` to angle `to`, in `(-PI, PI]`. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d <= -Math.PI) d += 2 * Math.PI;
  else if (d > Math.PI) d -= 2 * Math.PI;
  return d;
}

/** A uniform draw from `[lo, hi)`. */
export function uniform(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** A small deterministic hash in `[0, 1)`, for cosmetic per-entity variety. */
export function hash01(a: number, b = 0): number {
  let h =
    Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
