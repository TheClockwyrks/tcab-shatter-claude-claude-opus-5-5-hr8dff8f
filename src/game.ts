// Shatter — the game: the state it holds, the debug surface that poses and
// reads that state, and the three functions the engine drives.
//
// `update` reads the frame's input once, converts the frame's delta into whole
// ticks of the fixed TICK_HZ timestep (carrying the remainder in `tickClock`),
// and advances the world tick by tick through `src/sim.ts`, which never reads
// the renderer. `render` (in `src/render.ts`) only draws what it is handed.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES, TICK_DT, type RockSize } from "./constants";
import { CUE_SPECS } from "./audio";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { applyPointer, menuItems, moveHighlight } from "./menu";
import { drawGame, FIELD_COLOR } from "./render";
import { tick, type TickControls } from "./sim";
import type { MenuRect, ShatterSnapshot } from "./types";
import { cloneState, startGame, titleState, type Draft } from "./world";

export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}

export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}

export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}

export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}

/** A burst of debris left where something was destroyed. Cosmetic only. */
export interface EffectState {
  readonly kind: "rock" | "ship" | "saucer";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** Seconds the burst has left to show. */
  readonly t: number;
  readonly seed: number;
}

/** A pointer or touch contact that went down on a menu, and the entry it hit. */
export interface MenuPressState {
  readonly id: number;
  readonly item: number;
}

export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;

  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;

  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;

  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;

  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;

  // Fields this build adds beside the declared ones. `reset` empties them.

  /** Menu presses awaiting their release, so a confirm spans frames. */
  readonly menuPress: readonly MenuPressState[];
  /** A fire press that arrived on a frame that ran no tick. */
  readonly fireQueued: boolean;
  /** A torpedo press that arrived on a frame that ran no tick. */
  readonly torpedoQueued: boolean;
  /** Seconds left on the extra-ship announcement. */
  readonly extraLifeTimer: number;
  /** Debris bursts still showing. */
  readonly effects: readonly EffectState[];
}

type View = DeepReadonly<ShatterState>;

/** The debug and automation surface (specs/instrumentation.md). */
export interface ShatterDebugApi {
  readonly version: number;

  reset(state: View): ShatterState;
  snapshot(state: View): ShatterSnapshot;
  reconcile(state: View): ShatterState;
  menuItemRect(state: View, index: number): MenuRect | null;

  setScreen(state: View, screen: Screen): ShatterState;
  setMenuIndex(state: View, n: number): ShatterState;
  setScore(state: View, n: number): ShatterState;
  setLives(state: View, n: number): ShatterState;
  setWave(state: View, n: number): ShatterState;
  setWaveBanner(state: View, seconds: number): ShatterState;

  setWaveSpawning(state: View, enabled: boolean): ShatterState;
  setSaucerSpawning(state: View, enabled: boolean): ShatterState;
  setSaucerDue(state: View, seconds: number): ShatterState;

  setShipPosition(state: View, x: number, y: number): ShatterState;
  setShipVelocity(state: View, vx: number, vy: number): ShatterState;
  setShipAngle(state: View, radians: number): ShatterState;
  setShipInvuln(state: View, seconds: number): ShatterState;
  setFireCooldown(state: View, ticks: number): ShatterState;
  setShipCollision(state: View, enabled: boolean): ShatterState;

  addBullet(
    state: View,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeBullet(state: View, id: number): ShatterState;
  clearBullets(state: View): ShatterState;
  addEnemyBullet(
    state: View,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeEnemyBullet(state: View, id: number): ShatterState;
  clearEnemyBullets(state: View): ShatterState;

  addRock(state: View, size: RockSize, x: number, y: number): ShatterState;
  setRockVelocity(
    state: View,
    id: number,
    vx: number,
    vy: number,
  ): ShatterState;
  setRockHealth(state: View, id: number, hp: number): ShatterState;
  removeRock(state: View, id: number): ShatterState;
  clearRocks(state: View): ShatterState;

  addSaucer(state: View, x: number, y: number): ShatterState;
  setSaucerVelocity(state: View, vx: number, vy: number): ShatterState;
  setSaucerWeave(state: View, direction: 1 | -1): ShatterState;
  removeSaucer(state: View): ShatterState;
  setSaucerMind(state: View, enabled: boolean): ShatterState;
  setSaucerGun(state: View, enabled: boolean): ShatterState;
  setSaucerTravel(state: View, enabled: boolean): ShatterState;

  setNextSaucerEdge(state: View, edge: SaucerEdge): ShatterState;
  setNextSaucerRow(state: View, y: number): ShatterState;
  setNextSaucerAim(state: View, radians: number): ShatterState;
  setNextRockSpeed(state: View, speed: number): ShatterState;
  setNextRecycleEdge(state: View, edge: FieldEdge): ShatterState;

  setTorpedoCharge(state: View, fraction: number): ShatterState;
  addTorpedo(state: View, x: number, y: number, heading: number): ShatterState;
  setTorpedoHeading(state: View, id: number, radians: number): ShatterState;
  setTorpedoHoming(state: View, id: number, enabled: boolean): ShatterState;
  removeTorpedo(state: View, id: number): ShatterState;
  clearTorpedoes(state: View): ShatterState;
}

/** The field background; the letterbox bars are cleared to it too. */
export const BACKGROUND = FIELD_COLOR;

/** The edges and holds one frame carries, each edge read exactly once. */
interface FrameInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
  readonly fire: boolean;
  readonly torpedo: boolean;
  readonly holdUp: boolean;
  readonly holdLeft: boolean;
  readonly holdRight: boolean;
  readonly holdFire: boolean;
}

function readInput(api: UpdateApi): FrameInput {
  const { input } = api;
  return {
    up: input.pressed("up"),
    down: input.pressed("down"),
    confirm: input.pressed("confirm"),
    back: input.pressed("back"),
    pause: input.pressed("pause"),
    fire: input.pressed("a"),
    torpedo: input.pressed("b"),
    holdUp: input.value("up") > 0,
    holdLeft: input.value("left") > 0,
    holdRight: input.value("right") > 0,
    holdFire: input.value("a") > 0,
  };
}

/** Act on the highlighted entry of the menu `d.screen` shows. */
function confirmEntry(d: Draft, index: number): void {
  const items = menuItems(d.screen);
  const entry = items?.[index];
  switch (entry) {
    case "PLAY":
    case "RESTART":
    case "PLAY AGAIN":
      startGame(d);
      break;
    case "HOW TO PLAY":
      d.screen = "howto";
      d.menuIndex = index;
      break;
    case "RESUME":
      d.screen = "playing";
      d.menuIndex = 0;
      break;
    case "QUIT TO MENU":
    case "MENU":
      d.screen = "title";
      d.menuIndex = 0;
      break;
  }
  d.menuPress = [];
}

/** Keys first, then the pointer and touch contacts, over a menu screen. */
function runMenu(d: Draft, input: FrameInput, api: UpdateApi): void {
  const items = menuItems(d.screen);
  if (items === null) return;
  let index = d.menuIndex;
  if (input.up) index = moveHighlight(index, -1, items.length);
  if (input.down) index = moveHighlight(index, 1, items.length);
  d.menuIndex = index;
  if (input.confirm) {
    d.menuIndex = moveHighlight(index, 0, items.length);
    confirmEntry(d, d.menuIndex);
    return;
  }
  const pointer = applyPointer(
    d.screen,
    api.input.pointerSamples(),
    d.menuPress,
  );
  d.menuPress = pointer.presses;
  if (pointer.highlight !== null) d.menuIndex = pointer.highlight;
  if (pointer.confirm !== null) confirmEntry(d, pointer.confirm);
}

/** Advance the live field by `ticks` whole ticks. */
function runPlay(
  d: Draft,
  input: FrameInput,
  ticks: number,
  cues: Set<string>,
): void {
  if (input.fire) d.fireQueued = true;
  if (input.torpedo) d.torpedoQueued = true;
  for (let i = 0; i < ticks && d.screen === "playing"; i++) {
    const controls: TickControls = {
      turn: (input.holdRight ? 1 : 0) - (input.holdLeft ? 1 : 0),
      thrust: input.holdUp,
      fire: input.holdFire || d.fireQueued,
      torpedo: d.torpedoQueued,
    };
    d.fireQueued = false;
    d.torpedoQueued = false;
    for (const cue of tick(d, controls).cues) cues.add(cue);
  }
  if (d.screen !== "playing") d.ship.thrusting = false;
}

function advance(state: View, api: UpdateApi, dt: number): ShatterState {
  const input = readInput(api);
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());

  const d = cloneState(state);
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const carried = d.tickClock + step;
  const ticks = Math.max(0, Math.floor(carried / TICK_DT + 1e-9));
  d.tickClock = Math.max(0, carried - ticks * TICK_DT);
  for (let i = 0; i < ticks; i++) d.simTime += TICK_DT;

  const cues = new Set<string>();
  switch (d.screen) {
    case "title":
    case "gameover":
      if (input.back && d.screen === "gameover") {
        d.screen = "title";
        d.menuIndex = 0;
      } else {
        runMenu(d, input, api);
      }
      break;
    case "howto":
      if (input.back || input.confirm) d.screen = "title";
      break;
    case "playing":
      if (input.pause) {
        d.screen = "paused";
        d.menuIndex = 0;
        d.ship.thrusting = false;
      } else {
        runPlay(d, input, ticks, cues);
      }
      break;
    case "paused":
      if (input.pause || input.back) {
        d.screen = "playing";
        d.menuIndex = 0;
      } else {
        runMenu(d, input, api);
      }
      break;
  }

  for (const cue of cues) api.audio.play(cue);
  if (d.screen === "playing" && d.ship.thrusting) api.audio.loop(CUES.thrust);
  else api.audio.stop(CUES.thrust);

  d.muted = api.audio.muted();
  return d;
}

/** The game this build's engine drives. */
export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>): [ShatterState, ShatterDebugApi] {
    for (const name of ACTIONS) api.input.register(name, BINDINGS[name]);
    for (const [cue, spec] of Object.entries(CUE_SPECS))
      api.audio.define(cue, spec);
    registerDiagnostics(api);
    return [titleState(false), createDebugApi()];
  },

  update(state: View, api: UpdateApi, dt: number): ShatterState {
    return advance(state, api, dt);
  },

  render(state: View, api: RenderApi): void {
    drawGame(api.ctx, state);
  },
};
