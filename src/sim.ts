// Shatter — one tick of the simulation (specs/simulation.md). Nothing here
// reads the renderer, a canvas, or the clock: a tick is a function of the draft
// it advances, the controls held on it, and the random draws it makes.

import type { DeepWritable } from "ts-essentials";
import {
  BULLET_R,
  CORE_R,
  CUES,
  EXTRA_LIFE_STEP,
  FIELD_H,
  FIELD_W,
  FIRE_INTERVAL_TICKS,
  HIT_FLASH_TIME,
  INVULN_TIME,
  MAX_BULLETS,
  MU,
  MUZZLE_SPEED,
  ROCK_CHILD,
  ROCK_RADIUS,
  SAUCER_AIM_ERROR,
  SAUCER_BULLET_R,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRE_INTERVAL,
  SAUCER_GAP_MAX,
  SAUCER_GAP_MIN,
  SAUCER_LIFETIME,
  SAUCER_R,
  SAUCER_WEAVE_INTERVAL,
  SAUCER_WEAVE_SPEED,
  SCORE_LARGE,
  SCORE_MEDIUM,
  SCORE_SAUCER,
  SCORE_SMALL,
  SHIP_DRAG_HALFLIFE,
  SHIP_MAX,
  SHIP_R,
  SHIP_THRUST,
  SHIP_TURN,
  SOFTEN,
  SPLIT_KICK,
  STAR_X,
  STAR_Y,
  TICK_DT,
  TORPEDO_CONE,
  TORPEDO_R,
  TORPEDO_RECHARGE,
  TORPEDO_SCATTER,
  TORPEDO_SPEED,
  TORPEDO_TURN,
  WAVE_BANNER_TIME,
  type CueName,
  type RockSize,
} from "./constants";
import type { EffectState, RockState } from "./game";
import {
  angleDelta,
  separation,
  sweepContact,
  uniform,
  wrapCoord,
} from "./geometry";
import {
  EXTRA_LIFE_NOTICE,
  SAUCER_CLEARANCE,
  arriveSaucer,
  freshShip,
  makeBullet,
  makeEnemyBullet,
  makeRock,
  makeTorpedo,
  recycleRock,
  spawnWave,
  spinRate,
  type Draft,
} from "./world";

/** The controls in force on one tick. */
export interface TickControls {
  /** `-1` turning counter-clockwise, `1` clockwise, `0` neither. */
  readonly turn: number;
  readonly thrust: boolean;
  /** The fire key is held, or was pressed for this tick. */
  readonly fire: boolean;
  /** The torpedo key was pressed for this tick. */
  readonly torpedo: boolean;
}

export const NO_CONTROLS: TickControls = {
  turn: 0,
  thrust: false,
  fire: false,
  torpedo: false,
};

/** How far ahead of the ship's centre a shot leaves, inside `SHIP_R`. */
export const MUZZLE_OFFSET = 8;

/** How long a burst of debris shows. */
const EFFECT_TIME: Readonly<Record<EffectState["kind"], number>> = {
  rock: 0.55,
  ship: 1.1,
  saucer: 0.8,
};

const SHIP_DRAG = Math.pow(0.5, TICK_DT / SHIP_DRAG_HALFLIFE);

const ROCK_SCORE: Readonly<Record<RockSize, number>> = {
  large: SCORE_LARGE,
  medium: SCORE_MEDIUM,
  small: SCORE_SMALL,
};

/** The well's pull on a body at `(x, y)` (specs/gravity.md). */
export function gravityAt(x: number, y: number): { ax: number; ay: number } {
  const dx = STAR_X - x;
  const dy = STAR_Y - y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { ax: 0, ay: 0 };
  const eff = Math.max(d, SOFTEN);
  const mag = MU / (eff * eff);
  return { ax: (dx / d) * mag, ay: (dy / d) * mag };
}

interface Moving {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Steps 2 to 5 for a body the well pulls. */
function moveBallistic(b: Moving): void {
  const g = gravityAt(b.x, b.y);
  b.vx += g.ax * TICK_DT;
  b.vy += g.ay * TICK_DT;
  b.x = wrapCoord(b.x + b.vx * TICK_DT, FIELD_W);
  b.y = wrapCoord(b.y + b.vy * TICK_DT, FIELD_H);
}

/** Steps 4 and 5 for a powered body the well never touches. */
function moveStraight(b: Moving): void {
  b.x = wrapCoord(b.x + b.vx * TICK_DT, FIELD_W);
  b.y = wrapCoord(b.y + b.vy * TICK_DT, FIELD_H);
}

/** A body as the collision step sees it: where it began the tick and how far it went. */
interface Swept {
  readonly sx: number;
  readonly sy: number;
  readonly dx: number;
  readonly dy: number;
  readonly r: number;
}

function sweptOf(b: Moving, r: number, moved: boolean): Swept {
  const dx = moved ? b.vx * TICK_DT : 0;
  const dy = moved ? b.vy * TICK_DT : 0;
  return { sx: b.x - dx, sy: b.y - dy, dx, dy, r };
}

/** The earliest fraction of the tick at which two swept bodies touch, or -1. */
function contact(a: Swept, b: Swept): number {
  const s = separation(a.sx, a.sy, b.sx, b.sy);
  return sweepContact(s.x, s.y, b.dx - a.dx, b.dy - a.dy, a.r + b.r);
}

const CORE: Swept = { sx: STAR_X, sy: STAR_Y, dx: 0, dy: 0, r: CORE_R };

/** Everything one tick decided that the frame acts on beyond the draft. */
export interface TickOutcome {
  readonly cues: Set<CueName>;
}

function addScore(d: Draft, points: number, cues: Set<CueName>): void {
  const before = Math.floor(d.score / EXTRA_LIFE_STEP);
  d.score += points;
  const crossed = Math.floor(d.score / EXTRA_LIFE_STEP) - before;
  if (crossed > 0) {
    d.lives += crossed;
    d.extraLifeTimer = EXTRA_LIFE_NOTICE;
    cues.add(CUES.extraLife);
  }
}

function addEffect(
  d: Draft,
  kind: EffectState["kind"],
  x: number,
  y: number,
  r: number,
  seed: number,
): void {
  d.effects.push({ kind, x, y, r, t: EFFECT_TIME[kind], seed });
}

/**
 * Destroy `rock`: split it, score it, and throw its fragments along `(ux, uy)`.
 * `across` throws them to either side of that line, as a bullet does; otherwise
 * one goes forward along it and one back, as a torpedo does.
 */
function destroyRock(
  d: Draft,
  rock: DeepWritable<RockState>,
  ux: number,
  uy: number,
  across: boolean,
  cues: Set<CueName>,
): void {
  const index = d.rocks.indexOf(rock);
  if (index >= 0) d.rocks.splice(index, 1);
  addScore(d, ROCK_SCORE[rock.size], cues);
  cues.add(CUES.shatter);
  addEffect(d, "rock", rock.x, rock.y, ROCK_RADIUS[rock.size], rock.id);
  const child = ROCK_CHILD[rock.size];
  if (child === null) return;
  const kick = across ? SPLIT_KICK : TORPEDO_SCATTER;
  const kx = (across ? -uy : ux) * kick;
  const ky = (across ? ux : uy) * kick;
  d.rocks.push(
    makeRock(d, child, rock.x, rock.y, rock.vx + kx, rock.vy + ky),
    makeRock(d, child, rock.x, rock.y, rock.vx - kx, rock.vy - ky),
  );
}

function unit(vx: number, vy: number): { x: number; y: number } {
  const m = Math.hypot(vx, vy);
  return m > 0 ? { x: vx / m, y: vy / m } : { x: 1, y: 0 };
}

/** Step 1 for the ship: turn, then thrust; step 3: drag and the cap. */
function flyShip(d: Draft, c: TickControls): void {
  const ship = d.ship;
  ship.angle += c.turn * SHIP_TURN * TICK_DT;
  ship.thrusting = c.thrust;
  if (c.thrust) {
    ship.vx += Math.cos(ship.angle) * SHIP_THRUST * TICK_DT;
    ship.vy += Math.sin(ship.angle) * SHIP_THRUST * TICK_DT;
  }
  ship.vx *= SHIP_DRAG;
  ship.vy *= SHIP_DRAG;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > SHIP_MAX) {
    ship.vx *= SHIP_MAX / speed;
    ship.vy *= SHIP_MAX / speed;
  }
}

/** The slide along the core (specs/collision.md). */
function slideShip(d: Draft): void {
  const ship = d.ship;
  const s = separation(STAR_X, STAR_Y, ship.x, ship.y);
  const dist = Math.hypot(s.x, s.y);
  const rest = CORE_R + SHIP_R;
  if (dist >= rest) return;
  const nx = dist > 0 ? s.x / dist : 0;
  const ny = dist > 0 ? s.y / dist : 1;
  ship.x = wrapCoord(STAR_X + nx * rest, FIELD_W);
  ship.y = wrapCoord(STAR_Y + ny * rest, FIELD_H);
  const inward = ship.vx * nx + ship.vy * ny;
  if (inward < 0) {
    ship.vx -= inward * nx;
    ship.vy -= inward * ny;
  }
}

/** Step 1 for a torpedo: acquire within the forward cone and turn onto it. */
function guideTorpedo(d: Draft, t: Draft["torpedoes"][number]): void {
  if (t.homing) {
    let best: { bearing: number; dist: number } | null = null;
    const consider = (x: number, y: number): void => {
      const s = separation(t.x, t.y, x, y);
      const dist = Math.hypot(s.x, s.y);
      if (dist === 0) return;
      const bearing = Math.atan2(s.y, s.x);
      if (Math.abs(angleDelta(t.heading, bearing)) > TORPEDO_CONE) return;
      if (best === null || dist < best.dist) best = { bearing, dist };
    };
    for (const r of d.rocks) consider(r.x, r.y);
    if (d.saucer) consider(d.saucer.x, d.saucer.y);
    const target = best as { bearing: number; dist: number } | null;
    if (target !== null) {
      const turn = angleDelta(t.heading, target.bearing);
      const limit = TORPEDO_TURN * TICK_DT;
      t.heading += Math.max(-limit, Math.min(limit, turn));
    }
  }
  t.vx = Math.cos(t.heading) * TORPEDO_SPEED;
  t.vy = Math.sin(t.heading) * TORPEDO_SPEED;
}

/** Step 1 for the saucer: the weave reroll, and steering clear of the core. */
function steerSaucer(d: Draft): void {
  const s = d.saucer;
  if (s === null) return;
  s.weaveClock -= TICK_DT;
  const reroll = s.weaveClock <= 1e-9;
  if (reroll) s.weaveClock += SAUCER_WEAVE_INTERVAL;
  if (!s.mind) return;
  if (reroll) {
    s.vy =
      s.vy === 0
        ? s.weave * SAUCER_WEAVE_SPEED
        : -Math.sign(s.vy) * SAUCER_WEAVE_SPEED;
  }
  // Keeping clear of the core takes precedence over the weave: while the
  // crossing is closing on the star's row, climb or dive away from it.
  const rel = separation(STAR_X, STAR_Y, s.x, s.y);
  const zone = SAUCER_CLEARANCE + 26;
  const closing = rel.x * s.vx < 0 || (s.vx === 0 && Math.abs(rel.x) < zone);
  if (closing && Math.abs(rel.x) < zone + 170 && Math.abs(rel.y) < zone) {
    const away = rel.y !== 0 ? Math.sign(rel.y) : s.weave;
    s.vy = away * SAUCER_WEAVE_SPEED;
  }
}

/** Keep the saucer's centre outside the core's reach, whatever it was steered to. */
function clearSaucer(d: Draft): void {
  const s = d.saucer;
  if (s === null || !s.mind) return;
  const rel = separation(STAR_X, STAR_Y, s.x, s.y);
  const dist = Math.hypot(rel.x, rel.y);
  const keep = SAUCER_CLEARANCE + 2;
  if (dist >= keep) return;
  const nx = dist > 0 ? rel.x / dist : 0;
  const ny = dist > 0 ? rel.y / dist : s.weave;
  s.x = wrapCoord(STAR_X + nx * keep, FIELD_W);
  s.y = wrapCoord(STAR_Y + ny * keep, FIELD_H);
}

/** The saucer's gun, its lifetime, and its departure. */
function runSaucer(d: Draft): void {
  const s = d.saucer;
  if (s === null) return;
  s.fireClock -= TICK_DT;
  if (s.fireClock <= 1e-9) {
    s.fireClock += SAUCER_FIRE_INTERVAL;
    if (s.gun && d.lives > 0) {
      const aim = separation(s.x, s.y, d.ship.x, d.ship.y);
      const error =
        d.nextSaucerAim ?? uniform(-SAUCER_AIM_ERROR, SAUCER_AIM_ERROR);
      d.nextSaucerAim = null;
      const bearing = Math.atan2(aim.y, aim.x) + error;
      d.enemyBullets.push(
        makeEnemyBullet(
          d,
          s.x,
          s.y,
          Math.cos(bearing) * SAUCER_BULLET_SPEED + s.vx,
          Math.sin(bearing) * SAUCER_BULLET_SPEED + s.vy,
        ),
      );
    }
  }
  s.age += TICK_DT;
  if (s.age >= SAUCER_LIFETIME - 1e-9) saucerGone(d);
}

/** The saucer has left or been destroyed: the cadence starts over. */
function saucerGone(d: Draft): void {
  d.saucer = null;
  d.saucerClock = 0;
  d.saucerDue = uniform(SAUCER_GAP_MIN, SAUCER_GAP_MAX);
}

/** The ship is destroyed: a life is lost, and the next begins or the game ends. */
function loseShip(d: Draft, cues: Set<CueName>): void {
  cues.add(CUES.death);
  addEffect(d, "ship", d.ship.x, d.ship.y, SHIP_R, d.nextId);
  d.lives -= 1;
  if (d.lives > 0) {
    d.ship = freshShip(INVULN_TIME);
    d.torpedoCharge = 1;
  } else {
    d.lives = 0;
    d.ship = { ...d.ship, vx: 0, vy: 0, thrusting: false };
    d.screen = "gameover";
    d.menuIndex = 0;
  }
}

/** Advance the world by one tick, in the order specs/simulation.md fixes. */
export function tick(d: Draft, c: TickControls): TickOutcome {
  const cues = new Set<CueName>();
  const fresh = new Set<number>();
  const ship = d.ship;

  // 1-3: control forces, the well, velocities, drag and the cap.
  flyShip(d, c);
  steerSaucer(d);
  for (const t of d.torpedoes) guideTorpedo(d, t);

  // 2-5: the well on every pulled body, then positions and the wrap.
  const shipStartX = ship.x;
  const shipStartY = ship.y;
  moveStraight(ship);
  for (const b of d.bullets) moveBallistic(b);
  for (const b of d.enemyBullets) moveBallistic(b);
  for (const r of d.rocks) {
    moveBallistic(r);
    r.spin += spinRate(r.id) * TICK_DT;
  }
  for (const t of d.torpedoes) moveStraight(t);
  if (d.saucer?.travel) moveStraight(d.saucer);
  clearSaucer(d);

  // The weapons, which leave the nose where the ship now stands.
  if (ship.fireCooldown > 0) ship.fireCooldown -= 1;
  if (c.fire && ship.fireCooldown <= 0 && d.bullets.length < MAX_BULLETS) {
    const b = makeBullet(
      d,
      wrapCoord(ship.x + Math.cos(ship.angle) * MUZZLE_OFFSET, FIELD_W),
      wrapCoord(ship.y + Math.sin(ship.angle) * MUZZLE_OFFSET, FIELD_H),
      ship.vx + Math.cos(ship.angle) * MUZZLE_SPEED,
      ship.vy + Math.sin(ship.angle) * MUZZLE_SPEED,
    );
    d.bullets.push(b);
    fresh.add(b.id);
    ship.fireCooldown = FIRE_INTERVAL_TICKS;
    cues.add(CUES.fire);
  }
  if (c.torpedo && d.torpedoCharge >= 1 && d.torpedoes.length === 0) {
    const t = makeTorpedo(
      d,
      wrapCoord(ship.x + Math.cos(ship.angle) * MUZZLE_OFFSET, FIELD_W),
      wrapCoord(ship.y + Math.sin(ship.angle) * MUZZLE_OFFSET, FIELD_H),
      ship.angle,
    );
    d.torpedoes.push(t);
    fresh.add(t.id);
    d.torpedoCharge = 0;
  } else if (d.torpedoCharge < 1) {
    d.torpedoCharge = Math.min(1, d.torpedoCharge + TICK_DT / TORPEDO_RECHARGE);
  }

  // 6: collision resolution.
  let destroyed = false;
  const saucerSwept = (): Swept | null =>
    d.saucer ? sweptOf(d.saucer, SAUCER_R, d.saucer.travel) : null;

  // The ship's bullets: the core, a rock, or the saucer, whichever comes first.
  for (const b of [...d.bullets]) {
    const bs = sweptOf(b, BULLET_R, !fresh.has(b.id));
    let when = contact(CORE, bs);
    let hit: DeepWritable<RockState> | "core" | "saucer" | null =
      when >= 0 ? "core" : null;
    for (const r of d.rocks) {
      const t = contact(sweptOf(r, ROCK_RADIUS[r.size], true), bs);
      if (t >= 0 && (hit === null || t < when)) {
        hit = r;
        when = t;
      }
    }
    const ss = saucerSwept();
    if (ss) {
      const t = contact(ss, bs);
      if (t >= 0 && (hit === null || t < when)) hit = "saucer";
    }
    if (hit === null) continue;
    d.bullets.splice(d.bullets.indexOf(b), 1);
    if (hit === "saucer") {
      if (d.saucer) {
        addEffect(d, "saucer", d.saucer.x, d.saucer.y, SAUCER_R, d.saucer.id);
        saucerGone(d);
        addScore(d, SCORE_SAUCER, cues);
      }
    } else if (hit !== "core") {
      hit.health -= 1;
      if (hit.health <= 0) {
        const u = unit(b.vx, b.vy);
        destroyRock(d, hit, u.x, u.y, true, cues);
        destroyed = true;
      } else {
        hit.flash = HIT_FLASH_TIME;
      }
    }
  }

  // Torpedoes: the core, a rock, or the saucer, whichever comes first.
  for (const t of [...d.torpedoes]) {
    const ts = sweptOf(t, TORPEDO_R, !fresh.has(t.id));
    let when = contact(CORE, ts);
    let hit: DeepWritable<RockState> | "core" | "saucer" | null =
      when >= 0 ? "core" : null;
    for (const r of d.rocks) {
      const at = contact(sweptOf(r, ROCK_RADIUS[r.size], true), ts);
      if (at >= 0 && (hit === null || at < when)) {
        hit = r;
        when = at;
      }
    }
    const ss = saucerSwept();
    if (ss) {
      const at = contact(ss, ts);
      if (at >= 0 && (hit === null || at < when)) hit = "saucer";
    }
    if (hit === null) continue;
    d.torpedoes.splice(d.torpedoes.indexOf(t), 1);
    if (hit === "saucer") {
      if (d.saucer) {
        addEffect(d, "saucer", d.saucer.x, d.saucer.y, SAUCER_R, d.saucer.id);
        saucerGone(d);
        addScore(d, SCORE_SAUCER, cues);
      }
    } else if (hit !== "core") {
      const u = unit(t.vx, t.vy);
      destroyRock(d, hit, u.x, u.y, false, cues);
      destroyed = true;
    }
  }

  // Saucer bullets: only the core absorbs them; the ship is resolved below.
  d.enemyBullets = d.enemyBullets.filter(
    (b) => contact(CORE, sweptOf(b, SAUCER_BULLET_R, !fresh.has(b.id))) < 0,
  );

  // Rocks the core reaches are recycled.
  for (const r of d.rocks) {
    if (contact(CORE, sweptOf(r, ROCK_RADIUS[r.size], true)) >= 0) {
      recycleRock(d, r);
    }
  }

  // The ship: the slide along the core, then the three lethal contacts.
  slideShip(d);
  const shipSwept: Swept = {
    sx: shipStartX,
    sy: shipStartY,
    dx: separation(shipStartX, shipStartY, ship.x, ship.y).x,
    dy: separation(shipStartX, shipStartY, ship.x, ship.y).y,
    r: SHIP_R,
  };
  if (ship.invuln > 0) ship.invuln = Math.max(0, ship.invuln - TICK_DT);
  const lethal = ship.collision && ship.invuln <= 0;
  if (lethal) {
    let struck = false;
    for (const r of d.rocks) {
      if (contact(shipSwept, sweptOf(r, ROCK_RADIUS[r.size], true)) >= 0) {
        struck = true;
        break;
      }
    }
    const ss = saucerSwept();
    if (!struck && ss && contact(shipSwept, ss) >= 0) struck = true;
    if (!struck) {
      const index = d.enemyBullets.findIndex(
        (b) =>
          contact(shipSwept, sweptOf(b, SAUCER_BULLET_R, !fresh.has(b.id))) >=
          0,
      );
      if (index >= 0) {
        d.enemyBullets.splice(index, 1);
        struck = true;
      }
    }
    if (struck) loseShip(d, cues);
  }

  // Every timer counts down by one tick.
  d.bullets = d.bullets.filter((b) => (b.life -= TICK_DT) > 1e-9);
  d.enemyBullets = d.enemyBullets.filter((b) => (b.life -= TICK_DT) > 1e-9);
  d.torpedoes = d.torpedoes.filter((t) => (t.life -= TICK_DT) > 1e-9);
  for (const r of d.rocks)
    if (r.flash > 0) r.flash = Math.max(0, r.flash - TICK_DT);
  d.effects = d.effects.filter((e) => (e.t -= TICK_DT) > 0);
  if (d.extraLifeTimer > 0)
    d.extraLifeTimer = Math.max(0, d.extraLifeTimer - TICK_DT);
  runSaucer(d);

  // The saucer cadence runs whenever the field holds no saucer.
  if (d.saucer === null && d.lives > 0) {
    d.saucerClock += TICK_DT;
    if (d.saucerSpawning && d.saucerClock >= d.saucerDue - 1e-9) {
      arriveSaucer(d);
      cues.add(CUES.saucer);
    }
  }

  // The wave loop: the banner runs down and puts its wave up as it ends.
  if (d.waveBanner > 0) {
    d.waveBanner -= TICK_DT;
    if (d.waveBanner <= 1e-9) {
      d.waveBanner = 0;
      if (d.waveSpawning) spawnWave(d);
    }
  }
  if (destroyed && d.rocks.length === 0 && d.waveSpawning) {
    d.wave += 1;
    d.waveBanner = WAVE_BANNER_TIME;
  }

  return { cues };
}
