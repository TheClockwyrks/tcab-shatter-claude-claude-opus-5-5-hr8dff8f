// Shatter — the debug and automation surface (specs/instrumentation.md). Every
// pose takes the current state and returns the next one, built from a copy, so
// the state it was handed stays as it was. Every reading is pure.

import type { DeepReadonly } from "ts-essentials";
import {
  ROCK_RADIUS,
  SAUCER_SPEED,
  SHATTER_DEBUG_VERSION,
  type RockSize,
} from "./constants";
import type {
  FieldEdge,
  SaucerEdge,
  Screen,
  ShatterDebugApi,
  ShatterState,
} from "./game";
import { menuRect } from "./menu";
import type { ShatterSnapshot } from "./types";
import {
  cloneState,
  makeBullet,
  makeEnemyBullet,
  makeRock,
  makeSaucer,
  makeTorpedo,
  titleState,
  type Draft,
} from "./world";

type View = DeepReadonly<ShatterState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "playing",
  "paused",
  "gameover",
];
const SIZES: readonly RockSize[] = ["large", "medium", "small"];
const SAUCER_EDGES: readonly SaucerEdge[] = ["left", "right"];
const FIELD_EDGES: readonly FieldEdge[] = ["top", "bottom", "left", "right"];

function finite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(
      `Shatter debug: ${name} must be a finite number, got ${String(value)}`,
    );
  }
  return value;
}

function flag(name: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Shatter debug: ${name} must be a boolean, got ${String(value)}`,
    );
  }
  return value;
}

function oneOf<T extends string>(
  name: string,
  value: unknown,
  set: readonly T[],
): T {
  if (
    typeof value !== "string" ||
    !(set as readonly string[]).includes(value)
  ) {
    throw new RangeError(
      `Shatter debug: ${name} must be one of ${set.join(", ")}, got ${String(value)}`,
    );
  }
  return value as T;
}

function findIndex(
  kind: string,
  list: readonly { readonly id: number }[],
  id: unknown,
): number {
  const index = list.findIndex((e) => e.id === id);
  if (index < 0)
    throw new RangeError(`Shatter debug: no live ${kind} has id ${String(id)}`);
  return index;
}

/** Copy, change, and hand back: the shape every pose takes. */
function pose(state: View, change: (d: Draft) => void): ShatterState {
  const d = cloneState(state);
  change(d);
  return d;
}

function needSaucer(d: Draft): NonNullable<Draft["saucer"]> {
  if (d.saucer === null) throw new RangeError("Shatter debug: no saucer is up");
  return d.saucer;
}

export function snapshot(s: View): ShatterSnapshot {
  return {
    version: SHATTER_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    lives: s.lives,
    wave: s.wave,
    waveBanner: s.waveBanner,
    muted: s.muted,
    waveSpawning: s.waveSpawning,
    saucerSpawning: s.saucerSpawning,
    saucerClock: s.saucerClock,
    saucerDue: s.saucerDue,
    nextSaucerEdge: s.nextSaucerEdge,
    nextSaucerRow: s.nextSaucerRow,
    nextSaucerAim: s.nextSaucerAim,
    nextRockSpeed: s.nextRockSpeed,
    nextRecycleEdge: s.nextRecycleEdge,
    ship: {
      x: s.ship.x,
      y: s.ship.y,
      vx: s.ship.vx,
      vy: s.ship.vy,
      angle: s.ship.angle,
      speed: Math.hypot(s.ship.vx, s.ship.vy),
      thrusting: s.ship.thrusting,
      invuln: s.ship.invuln,
      collision: s.ship.collision,
      fireCooldown: s.ship.fireCooldown,
    },
    bullets: s.bullets.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      life: b.life,
    })),
    rocks: s.rocks.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      vx: r.vx,
      vy: r.vy,
      size: r.size,
      radius: ROCK_RADIUS[r.size],
      health: r.health,
    })),
    saucer: s.saucer
      ? {
          id: s.saucer.id,
          x: s.saucer.x,
          y: s.saucer.y,
          vx: s.saucer.vx,
          vy: s.saucer.vy,
          mind: s.saucer.mind,
          gun: s.saucer.gun,
          travel: s.saucer.travel,
          weave: s.saucer.weave,
          fireClock: s.saucer.fireClock,
          weaveClock: s.saucer.weaveClock,
          age: s.saucer.age,
        }
      : null,
    enemyBullets: s.enemyBullets.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      life: b.life,
    })),
    torpedoes: s.torpedoes.map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      vx: t.vx,
      vy: t.vy,
      heading: t.heading,
      life: t.life,
      homing: t.homing,
    })),
    torpedoCharge: s.torpedoCharge,
    torpedoReady: s.torpedoCharge >= 1,
    simTime: s.simTime,
  };
}

/** Build the surface `initialize` returns beside the state. */
export function createDebugApi(): ShatterDebugApi {
  return {
    version: SHATTER_DEBUG_VERSION,

    // The core.
    reset: (s) => titleState(s.muted),
    snapshot,
    // Every reading the snapshot derives is worked out at the read.
    reconcile: (s) => cloneState(s),
    menuItemRect: (s, index) => {
      finite("index", index);
      return menuRect(s.screen, index);
    },

    // The screen and the run.
    setScreen: (s, screen) => {
      const next = oneOf("screen", screen, SCREENS);
      return pose(s, (d) => {
        d.screen = next;
      });
    },
    setMenuIndex: (s, n) => {
      finite("index", n);
      return pose(s, (d) => {
        d.menuIndex = n;
      });
    },
    setScore: (s, n) => {
      finite("score", n);
      return pose(s, (d) => {
        d.score = n;
      });
    },
    setLives: (s, n) => {
      finite("lives", n);
      return pose(s, (d) => {
        d.lives = n;
      });
    },
    setWave: (s, n) => {
      finite("wave", n);
      return pose(s, (d) => {
        d.wave = n;
      });
    },
    setWaveBanner: (s, seconds) => {
      finite("seconds", seconds);
      return pose(s, (d) => {
        d.waveBanner = seconds;
      });
    },

    // The world gates.
    setWaveSpawning: (s, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        d.waveSpawning = enabled;
      });
    },
    setSaucerSpawning: (s, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        d.saucerSpawning = enabled;
      });
    },
    setSaucerDue: (s, seconds) => {
      finite("seconds", seconds);
      return pose(s, (d) => {
        d.saucerDue = seconds;
      });
    },

    // The ship.
    setShipPosition: (s, x, y) => {
      finite("x", x);
      finite("y", y);
      return pose(s, (d) => {
        d.ship.x = x;
        d.ship.y = y;
      });
    },
    setShipVelocity: (s, vx, vy) => {
      finite("vx", vx);
      finite("vy", vy);
      return pose(s, (d) => {
        d.ship.vx = vx;
        d.ship.vy = vy;
      });
    },
    setShipAngle: (s, radians) => {
      finite("radians", radians);
      return pose(s, (d) => {
        d.ship.angle = radians;
      });
    },
    setShipInvuln: (s, seconds) => {
      finite("seconds", seconds);
      return pose(s, (d) => {
        d.ship.invuln = seconds;
      });
    },
    setFireCooldown: (s, ticks) => {
      finite("ticks", ticks);
      return pose(s, (d) => {
        d.ship.fireCooldown = ticks;
      });
    },
    setShipCollision: (s, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        d.ship.collision = enabled;
      });
    },

    // The bullets.
    addBullet: (s, x, y, vx, vy) => {
      [x, y, vx, vy].forEach((v, i) => finite(["x", "y", "vx", "vy"][i], v));
      return pose(s, (d) => {
        d.bullets.push(makeBullet(d, x, y, vx, vy));
      });
    },
    removeBullet: (s, id) =>
      pose(s, (d) => {
        d.bullets.splice(findIndex("bullet", d.bullets, id), 1);
      }),
    clearBullets: (s) =>
      pose(s, (d) => {
        d.bullets = [];
      }),
    addEnemyBullet: (s, x, y, vx, vy) => {
      [x, y, vx, vy].forEach((v, i) => finite(["x", "y", "vx", "vy"][i], v));
      return pose(s, (d) => {
        d.enemyBullets.push(makeEnemyBullet(d, x, y, vx, vy));
      });
    },
    removeEnemyBullet: (s, id) =>
      pose(s, (d) => {
        d.enemyBullets.splice(
          findIndex("saucer bullet", d.enemyBullets, id),
          1,
        );
      }),
    clearEnemyBullets: (s) =>
      pose(s, (d) => {
        d.enemyBullets = [];
      }),

    // The rocks.
    addRock: (s, size, x, y) => {
      const kind = oneOf("size", size, SIZES);
      finite("x", x);
      finite("y", y);
      return pose(s, (d) => {
        d.rocks.push(makeRock(d, kind, x, y, 0, 0));
      });
    },
    setRockVelocity: (s, id, vx, vy) => {
      finite("vx", vx);
      finite("vy", vy);
      return pose(s, (d) => {
        const rock = d.rocks[findIndex("rock", d.rocks, id)];
        rock.vx = vx;
        rock.vy = vy;
      });
    },
    setRockHealth: (s, id, hp) => {
      finite("hp", hp);
      return pose(s, (d) => {
        d.rocks[findIndex("rock", d.rocks, id)].health = hp;
      });
    },
    removeRock: (s, id) =>
      pose(s, (d) => {
        d.rocks.splice(findIndex("rock", d.rocks, id), 1);
      }),
    clearRocks: (s) =>
      pose(s, (d) => {
        d.rocks = [];
      }),

    // The saucer.
    addSaucer: (s, x, y) => {
      finite("x", x);
      finite("y", y);
      return pose(s, (d) => {
        d.saucer = makeSaucer(d, x, y, SAUCER_SPEED, 1);
      });
    },
    setSaucerVelocity: (s, vx, vy) => {
      finite("vx", vx);
      finite("vy", vy);
      return pose(s, (d) => {
        const saucer = needSaucer(d);
        saucer.vx = vx;
        saucer.vy = vy;
      });
    },
    setSaucerWeave: (s, direction) => {
      if (direction !== 1 && direction !== -1) {
        throw new RangeError(
          `Shatter debug: weave must be 1 or -1, got ${String(direction)}`,
        );
      }
      return pose(s, (d) => {
        needSaucer(d).weave = direction;
      });
    },
    removeSaucer: (s) =>
      pose(s, (d) => {
        d.saucer = null;
      }),
    setSaucerMind: (s, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        needSaucer(d).mind = enabled;
      });
    },
    setSaucerGun: (s, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        needSaucer(d).gun = enabled;
      });
    },
    setSaucerTravel: (s, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        needSaucer(d).travel = enabled;
      });
    },

    // Posed draws.
    setNextSaucerEdge: (s, edge) => {
      const next = oneOf("edge", edge, SAUCER_EDGES);
      return pose(s, (d) => {
        d.nextSaucerEdge = next;
      });
    },
    setNextSaucerRow: (s, y) => {
      finite("y", y);
      return pose(s, (d) => {
        d.nextSaucerRow = y;
      });
    },
    setNextSaucerAim: (s, radians) => {
      finite("radians", radians);
      return pose(s, (d) => {
        d.nextSaucerAim = radians;
      });
    },
    setNextRockSpeed: (s, speed) => {
      finite("speed", speed);
      return pose(s, (d) => {
        d.nextRockSpeed = speed;
      });
    },
    setNextRecycleEdge: (s, edge) => {
      const next = oneOf("edge", edge, FIELD_EDGES);
      return pose(s, (d) => {
        d.nextRecycleEdge = next;
      });
    },

    // The torpedoes.
    setTorpedoCharge: (s, fraction) => {
      finite("fraction", fraction);
      return pose(s, (d) => {
        d.torpedoCharge = fraction;
      });
    },
    addTorpedo: (s, x, y, heading) => {
      finite("x", x);
      finite("y", y);
      finite("heading", heading);
      return pose(s, (d) => {
        d.torpedoes.push(makeTorpedo(d, x, y, heading));
      });
    },
    setTorpedoHeading: (s, id, radians) => {
      finite("radians", radians);
      return pose(s, (d) => {
        const t = d.torpedoes[findIndex("torpedo", d.torpedoes, id)];
        const speed = Math.hypot(t.vx, t.vy);
        t.heading = radians;
        t.vx = Math.cos(radians) * speed;
        t.vy = Math.sin(radians) * speed;
      });
    },
    setTorpedoHoming: (s, id, enabled) => {
      flag("enabled", enabled);
      return pose(s, (d) => {
        d.torpedoes[findIndex("torpedo", d.torpedoes, id)].homing = enabled;
      });
    },
    removeTorpedo: (s, id) =>
      pose(s, (d) => {
        d.torpedoes.splice(findIndex("torpedo", d.torpedoes, id), 1);
      }),
    clearTorpedoes: (s) =>
      pose(s, (d) => {
        d.torpedoes = [];
      }),
  };
}
