// Shatter — showcase capture rig. Not part of the game build.
//
// Stands the real game up on a constant clock and flies it with a simple
// autopilot that does nothing but press and release the game's own keys, the
// way a player would. Nothing is posed through the debug surface: every frame
// recorded here comes from the game's own rules under real play.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT, TICK_DT } from "../../src/constants";
import { BACKGROUND, game } from "../../src/game";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const engine = createEngine({
  canvas,
  width: FIELD_W,
  height: FIELD_H,
  game,
  background: BACKGROUND,
  layout: LAYOUT,
  clock: new ConstantClock(1000 / 60),
});

const held = new Set<string>();

function key(code: string, down: boolean): void {
  if (down === held.has(code)) return;
  if (down) held.add(code);
  else held.delete(code);
  document.dispatchEvent(
    new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code }),
  );
}

function wrapDelta(d: number, size: number): number {
  let r = d % size;
  if (r < -size / 2) r += size;
  else if (r >= size / 2) r -= size;
  return r;
}

function angleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d <= -Math.PI) d += 2 * Math.PI;
  else if (d > Math.PI) d -= 2 * Math.PI;
  return d;
}

const ROCK_R = { large: 46, medium: 26, small: 14 } as const;

/** Decide which keys the autopilot holds this frame, from what it can see. */
function pilot(useTorpedo: boolean): void {
  const s = engine.state;
  if (s.screen !== "playing") {
    release();
    return;
  }
  const ship = s.ship;
  type Seen = { dx: number; dy: number; d: number; vx: number; vy: number };
  const look = (x: number, y: number, vx: number, vy: number): Seen => {
    const dx = wrapDelta(x - ship.x, FIELD_W);
    const dy = wrapDelta(y - ship.y, FIELD_H);
    return { dx, dy, d: Math.hypot(dx, dy), vx, vy };
  };

  // The closest threat, measured from the rock's edge and looking a little ahead.
  let threat: Seen | null = null;
  let threatGap = Infinity;
  let nearest: (Seen & { large: boolean }) | null = null;
  for (const r of s.rocks) {
    const seen = look(r.x, r.y, r.vx, r.vy);
    const ahead = look(r.x + r.vx * 0.35, r.y + r.vy * 0.35, r.vx, r.vy);
    const gap = Math.min(seen.d, ahead.d) - ROCK_R[r.size];
    if (gap < threatGap) {
      threatGap = gap;
      threat = seen;
    }
    if (nearest === null || seen.d < nearest.d)
      nearest = { ...seen, large: r.size === "large" };
  }
  for (const b of s.enemyBullets) {
    const seen = look(b.x, b.y, b.vx, b.vy);
    if (seen.d - 30 < threatGap) {
      threatGap = seen.d - 30;
      threat = seen;
    }
  }

  const safe = ship.invuln > 0.4;
  if (!safe && threat !== null && threatGap < 95) {
    // Evade: turn side-on to the threat and burn away from it.
    const away = Math.atan2(-threat.dy, -threat.dx);
    const diff = angleDelta(ship.angle, away);
    key("ArrowRight", diff > 0.1);
    key("ArrowLeft", diff < -0.1);
    key("ArrowUp", Math.abs(diff) < 1.2);
    key("Space", false);
    key("KeyF", false);
    return;
  }

  const target = s.saucer
    ? look(s.saucer.x, s.saucer.y, s.saucer.vx, s.saucer.vy)
    : nearest;
  if (target === null) {
    release();
    return;
  }
  const lead = target.d / 520;
  const aim = Math.atan2(
    target.dy + (target.vy - ship.vy) * lead,
    target.dx + (target.vx - ship.vx) * lead,
  );
  const diff = angleDelta(ship.angle, aim);
  key("ArrowRight", diff > 0.04);
  key("ArrowLeft", diff < -0.04);
  key("Space", Math.abs(diff) < 0.12 && target.d < 560);
  const speed = Math.hypot(ship.vx, ship.vy);
  const starGap = Math.hypot(640 - ship.x, 360 - ship.y);
  key(
    "ArrowUp",
    starGap > 120 && target.d > 430 && speed < 140 && Math.abs(diff) < 0.3,
  );
  key(
    "KeyF",
    useTorpedo &&
      s.torpedoCharge >= 1 &&
      s.torpedoes.length === 0 &&
      nearest !== null &&
      nearest.large &&
      target === nearest &&
      Math.abs(diff) < 0.08,
  );
}

async function fly(frames: number, useTorpedo = true): Promise<void> {
  for (let i = 0; i < frames; i++) {
    pilot(useTorpedo);
    await engine.advance(1);
  }
}

async function tap(code: string): Promise<void> {
  key(code, true);
  await engine.advance(1);
  key(code, false);
  await engine.advance(1);
}

function release(): void {
  for (const code of [...held]) key(code, false);
}

const rig = {
  engine,
  fly,
  tap,
  release,
  key,
  seconds: (n: number) => Math.round(n / TICK_DT / 2),
};

declare global {
  interface Window {
    rig: typeof rig;
    rigReady: Promise<void>;
  }
}

window.rig = rig;
window.rigReady = engine.initialize().then(() => undefined);
