import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { createDebugApi } from "./debug";
import type { Screen } from "./game";
import { drawGame } from "./render";
import { titleState } from "./world";

const debug = createDebugApi();

/** A busy field: every kind of body, mid-wrap, damaged and flashing. */
function busyState(screen: Screen) {
  let s = debug.setScreen(titleState(false), screen);
  s = debug.setWave(s, 3);
  s = debug.setWaveBanner(s, 0.8);
  s = debug.setLives(s, 3);
  s = debug.setShipInvuln(s, 1);
  s = debug.addRock(s, "large", 5, 5);
  s = debug.setRockHealth(s, s.rocks[0].id, 1);
  s = debug.addRock(s, "medium", 1270, 700);
  s = debug.addRock(s, "small", 300, 300);
  s = debug.addBullet(s, 1278, 100, 400, 0);
  s = debug.addEnemyBullet(s, 200, 718, 0, 300);
  s = debug.addTorpedo(s, 600, 100, 0.3);
  s = debug.addSaucer(s, 2, 400);
  return {
    ...s,
    simTime: 3.2,
    bullets: s.bullets.map((b) => ({ ...b, life: 1.2 })),
    rocks: s.rocks.map((r, i) => (i === 2 ? { ...r, flash: 0.05 } : r)),
    ship: { ...s.ship, thrusting: true },
    extraLifeTimer: 1,
    effects: [
      { kind: "rock" as const, x: 400, y: 400, r: 26, t: 0.3, seed: 4 },
      { kind: "ship" as const, x: 500, y: 400, r: 14, t: 0.6, seed: 5 },
      { kind: "saucer" as const, x: 600, y: 400, r: 18, t: 0.6, seed: 6 },
    ],
  };
}

describe("drawing", () => {
  it.each(["title", "howto", "playing", "paused", "gameover"] as const)(
    "draws the %s screen without touching the state",
    (screen) => {
      const canvas = createCanvas(1280, 720);
      const ctx = canvas.getContext(
        "2d",
      ) as unknown as CanvasRenderingContext2D;
      const state = busyState(screen);
      const before = JSON.stringify(state);
      drawGame(ctx, state);
      expect(JSON.stringify(state)).toBe(before);
      const pixels = canvas.getContext("2d").getImageData(0, 0, 1280, 720).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4 * 97) if (pixels[i] > 40) lit++;
      expect(lit).toBeGreaterThan(10);
    },
  );
});
