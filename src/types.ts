// Shatter — the debug surface's reading shapes (specs/instrumentation.md).

import type { RockSize } from "./constants";
import type { FieldEdge, SaucerEdge, Screen } from "./game";

export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SnapshotBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface SnapshotRock {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: RockSize;
  radius: number;
  health: number;
}

export interface SnapshotSaucer {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mind: boolean;
  gun: boolean;
  travel: boolean;
  weave: 1 | -1;
  fireClock: number;
  weaveClock: number;
  age: number;
}

export interface SnapshotTorpedo {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  life: number;
  homing: boolean;
}

export interface ShatterSnapshot {
  version: number;
  screen: Screen;
  menuIndex: number;
  score: number;
  lives: number;
  wave: number;
  waveBanner: number;
  muted: boolean;
  waveSpawning: boolean;
  saucerSpawning: boolean;
  saucerClock: number;
  saucerDue: number;
  nextSaucerEdge: SaucerEdge | null;
  nextSaucerRow: number | null;
  nextSaucerAim: number | null;
  nextRockSpeed: number | null;
  nextRecycleEdge: FieldEdge | null;
  ship: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    speed: number;
    thrusting: boolean;
    invuln: number;
    collision: boolean;
    fireCooldown: number;
  };
  bullets: SnapshotBullet[];
  rocks: SnapshotRock[];
  saucer: SnapshotSaucer | null;
  enemyBullets: SnapshotBullet[];
  torpedoes: SnapshotTorpedo[];
  torpedoCharge: number;
  torpedoReady: boolean;
  simTime: number;
}
