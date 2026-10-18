// Shatter — a headless engine for the unit tests: the real engine over an
// `@napi-rs/canvas` canvas, a constant clock, and an event target the tests
// dispatch keys and pointer events at.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import {
  BACKGROUND,
  game,
  type ShatterDebugApi,
  type ShatterState,
} from "../game";

export interface Harness {
  readonly engine: Engine<ShatterState, ShatterDebugApi>;
  readonly debug: ShatterDebugApi;
  readonly target: EventTarget;
  /** Run `frames` frames of `1 / 120` s each: one tick per frame. */
  step(frames?: number): Promise<void>;
  /** Run `seconds` of game time in coarse frames of 100 ms: 12 ticks each. */
  wait(seconds: number): Promise<void>;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** Press and release a key across one frame. */
  tap(code: string): Promise<void>;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    pointerType?: string,
    id?: number,
  ): void;
  pose(fn: (debug: ShatterDebugApi, s: ShatterState) => ShatterState): void;
}

export async function makeHarness(stepMs = 1000 / 120): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  const debug = engine.debug;
  const key = (type: string, code: string): void => {
    const event = new Event(type);
    Object.assign(event, { code, key: code, repeat: false });
    target.dispatchEvent(event);
  };
  return {
    engine,
    debug,
    target,
    step: (frames = 1) => engine.advance(frames),
    async wait(seconds) {
      engine.setClock(new ConstantClock(100));
      await engine.advance(Math.round(seconds * 10));
      engine.setClock(new ConstantClock(stepMs));
    },
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    async tap(code) {
      key("keydown", code);
      await engine.advance(1);
      key("keyup", code);
    },
    pointer(type, x, y, pointerType = "mouse", id = 1) {
      const event = new Event(type);
      Object.assign(event, {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType,
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : type === "pointerdown" ? 1 : 0,
      });
      target.dispatchEvent(event);
    },
    pose(fn) {
      engine.apply((s) => fn(debug, s as ShatterState));
    },
  };
}

/** Open a quiet game: no wave loop, no saucer, an empty field. */
export async function quietGame(): Promise<Harness> {
  const h = await makeHarness();
  await h.tap("Enter");
  h.pose((d, s) => d.setWaveSpawning(s, false));
  h.pose((d, s) => d.setSaucerSpawning(s, false));
  h.pose((d, s) => d.clearRocks(s));
  return h;
}
