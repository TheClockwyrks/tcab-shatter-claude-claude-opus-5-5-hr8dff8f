// Shatter — building and re-building the world: the title-screen state, a new
// game, and the factories every entity is made by. Each works on a writable
// draft the caller owns (see `Draft`), never on a state somebody else holds.

import type { DeepReadonly, DeepWritable } from "ts-essentials";
import {
  BULLET_LIFE,
  CORE_R,
  FACE_UP,
  FIELD_H,
  FIELD_W,
  ROCK_HEALTH,
  ROCK_SPEED_MAX,
  ROCK_SPEED_MIN,
  SAFE_X,
  SAFE_Y,
  SAUCER_BULLET_LIFE,
  SAUCER_FIRE_INTERVAL,
  SAUCER_FIRST_DELAY,
  SAUCER_R,
  SAUCER_SPEED,
  SAUCER_WEAVE_INTERVAL,
  START_LIVES,
  STAR_X,
  STAR_Y,
  TORPEDO_LIFE,
  TORPEDO_SPEED,
  WAVE_BASE_ROCKS,
  WAVE_MIN_SHIP_DIST,
  WAVE_MIN_STAR_DIST,
  WAVE_SPEED_CAP,
  WAVE_SPEED_STEP,
  type RockSize,
} from "./constants";
import type {
  BulletState,
  FieldEdge,
  RockState,
  SaucerEdge,
  SaucerState,
  ShatterState,
  ShipState,
  TorpedoState,
} from "./game";
import { hash01, uniform, wrappedDistance } from "./geometry";

/** A writable copy of the state, owned by whoever made it. */
export type Draft = DeepWritable<ShatterState>;

/** How long the extra-ship announcement stays on the field. */
export const EXTRA_LIFE_NOTICE = 1.6;

/** A fresh copy of `state` that the caller may write into. */
export function cloneState(state: DeepReadonly<ShatterState>): Draft {
  return {
    ...state,
    ship: { ...state.ship },
    bullets: state.bullets.map((b) => ({ ...b })),
    rocks: state.rocks.map((r) => ({ ...r })),
    saucer: state.saucer ? { ...state.saucer } : null,
    enemyBullets: state.enemyBullets.map((b) => ({ ...b })),
    torpedoes: state.torpedoes.map((t) => ({ ...t })),
    menuPress: state.menuPress.map((p) => ({ ...p })),
    effects: state.effects.map((e) => ({ ...e })),
  };
}

/** A ship at rest at the safe point, facing up, as a life begins. */
export function freshShip(invuln: number): ShipState {
  return {
    x: SAFE_X,
    y: SAFE_Y,
    vx: 0,
    vy: 0,
    angle: FACE_UP,
    thrusting: false,
    invuln,
    collision: true,
    fireCooldown: 0,
  };
}

/** The title-screen state `initialize` opens on and `reset` restores. */
export function titleState(muted: boolean): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: freshShip(0),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted,
    menuPress: [],
    fireQueued: false,
    torpedoQueued: false,
    extraLifeTimer: 0,
    effects: [],
  };
}

/** Take the next entity id. */
export function takeId(d: Draft): number {
  const id = d.nextId;
  d.nextId += 1;
  return id;
}

/** A cosmetic spin rate for a rock, in radians per second, fixed by its id. */
export function spinRate(id: number): number {
  return (hash01(id, 17) - 0.5) * 1.6;
}

export function makeRock(
  d: Draft,
  size: RockSize,
  x: number,
  y: number,
  vx: number,
  vy: number,
): RockState {
  const id = takeId(d);
  return {
    id,
    x,
    y,
    vx,
    vy,
    size,
    spin: hash01(id, 3) * Math.PI * 2,
    health: ROCK_HEALTH[size],
    flash: 0,
  };
}

export function makeBullet(
  d: Draft,
  x: number,
  y: number,
  vx: number,
  vy: number,
): BulletState {
  return { id: takeId(d), x, y, vx, vy, life: BULLET_LIFE };
}

export function makeEnemyBullet(
  d: Draft,
  x: number,
  y: number,
  vx: number,
  vy: number,
): BulletState {
  return { id: takeId(d), x, y, vx, vy, life: SAUCER_BULLET_LIFE };
}

export function makeTorpedo(
  d: Draft,
  x: number,
  y: number,
  heading: number,
): TorpedoState {
  return {
    id: takeId(d),
    x,
    y,
    vx: Math.cos(heading) * TORPEDO_SPEED,
    vy: Math.sin(heading) * TORPEDO_SPEED,
    heading,
    life: TORPEDO_LIFE,
    homing: true,
  };
}

export function makeSaucer(
  d: Draft,
  x: number,
  y: number,
  vx: number,
  weave: 1 | -1,
): SaucerState {
  return {
    id: takeId(d),
    x,
    y,
    vx,
    vy: 0,
    mind: true,
    gun: true,
    travel: true,
    weave,
    fireClock: SAUCER_FIRE_INTERVAL,
    weaveClock: SAUCER_WEAVE_INTERVAL,
    age: 0,
  };
}

/** The base drift speed of the next placement: the posed one, or a fresh draw. */
function takeRockSpeed(d: Draft, size: RockSize): number {
  if (d.nextRockSpeed !== null) {
    const speed = d.nextRockSpeed;
    d.nextRockSpeed = null;
    return speed;
  }
  return uniform(ROCK_SPEED_MIN[size], ROCK_SPEED_MAX[size]);
}

/** The speed multiplier wave `n`'s rocks take. */
export function waveSpeedFactor(n: number): number {
  return 1 + Math.min(WAVE_SPEED_CAP, WAVE_SPEED_STEP * (n - 1));
}

/** A point at least the wave's minimum distances from the ship and the star. */
function waveSpawnPoint(d: Draft): { x: number; y: number } {
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    if (
      wrappedDistance(x, y, d.ship.x, d.ship.y) >= WAVE_MIN_SHIP_DIST &&
      wrappedDistance(x, y, STAR_X, STAR_Y) >= WAVE_MIN_STAR_DIST
    ) {
      return { x, y };
    }
  }
  // Unreachable in practice: the far corner region always qualifies.
  return {
    x: (d.ship.x + FIELD_W / 2) % FIELD_W,
    y: (d.ship.y + FIELD_H / 2) % FIELD_H,
  };
}

/** Put up wave `d.wave`'s Large rocks (specs/progression.md). */
export function spawnWave(d: Draft): void {
  const count = WAVE_BASE_ROCKS + d.wave;
  const factor = waveSpeedFactor(d.wave);
  const posed = d.nextRockSpeed;
  d.nextRockSpeed = null;
  for (let i = 0; i < count; i++) {
    const p = waveSpawnPoint(d);
    const dir = Math.random() * Math.PI * 2;
    const base = posed ?? uniform(ROCK_SPEED_MIN.large, ROCK_SPEED_MAX.large);
    const speed = base * factor;
    d.rocks.push(
      makeRock(
        d,
        "large",
        p.x,
        p.y,
        Math.cos(dir) * speed,
        Math.sin(dir) * speed,
      ),
    );
  }
}

const FIELD_EDGES: readonly FieldEdge[] = ["top", "bottom", "left", "right"];

/** Re-place a rock the star swallowed on an edge, heading inward (specs/rocks.md). */
export function recycleRock(d: Draft, rock: DeepWritable<RockState>): void {
  const edge =
    d.nextRecycleEdge ?? FIELD_EDGES[Math.floor(Math.random() * 4) % 4];
  d.nextRecycleEdge = null;
  const speed = takeRockSpeed(d, rock.size);
  // The inward normal of each edge, and a spread of up to 60 degrees about it.
  const spread = (Math.random() - 0.5) * (Math.PI / 1.5);
  let normal: number;
  switch (edge) {
    case "top":
      rock.x = Math.random() * FIELD_W;
      rock.y = 0;
      normal = Math.PI / 2;
      break;
    case "bottom":
      rock.x = Math.random() * FIELD_W;
      rock.y = FIELD_H - 1e-6;
      normal = -Math.PI / 2;
      break;
    case "left":
      rock.x = 0;
      rock.y = Math.random() * FIELD_H;
      normal = 0;
      break;
    case "right":
      rock.x = FIELD_W - 1e-6;
      rock.y = Math.random() * FIELD_H;
      normal = Math.PI;
      break;
  }
  rock.vx = Math.cos(normal + spread) * speed;
  rock.vy = Math.sin(normal + spread) * speed;
}

/** Bring in the saucer the cadence is due (specs/saucer.md). */
export function arriveSaucer(d: Draft): void {
  const edge: SaucerEdge =
    d.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right");
  const row = d.nextSaucerRow ?? uniform(SAUCER_R, FIELD_H - SAUCER_R);
  d.nextSaucerEdge = null;
  d.nextSaucerRow = null;
  const weave: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const x = edge === "left" ? SAUCER_R : FIELD_W - SAUCER_R;
  const vx = edge === "left" ? SAUCER_SPEED : -SAUCER_SPEED;
  d.saucer = makeSaucer(d, x, row, vx, weave);
  d.saucerClock = 0;
}

/** Open a new game on a cleared field (specs/progression.md). */
export function startGame(d: Draft): void {
  d.screen = "playing";
  d.menuIndex = 0;
  d.score = 0;
  d.lives = START_LIVES;
  d.wave = 1;
  d.waveBanner = 0;
  d.ship = freshShip(0);
  d.bullets = [];
  d.rocks = [];
  d.saucer = null;
  d.enemyBullets = [];
  d.torpedoes = [];
  d.torpedoCharge = 1;
  d.saucerClock = 0;
  d.saucerDue = SAUCER_FIRST_DELAY;
  d.menuPress = [];
  d.fireQueued = false;
  d.torpedoQueued = false;
  d.extraLifeTimer = 0;
  d.effects = [];
  if (d.waveSpawning) spawnWave(d);
}

/** The distance the saucer's centre always keeps from the star. */
export const SAUCER_CLEARANCE = CORE_R + SAUCER_R;
