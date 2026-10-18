import { describe, expect, it } from "vitest";
import {
  CUES,
  EXTRA_LIFE_STEP,
  WAVE_BANNER_TIME,
  WAVE_MIN_SHIP_DIST,
  WAVE_MIN_STAR_DIST,
} from "./constants";
import { wrappedDistance } from "./geometry";
import { makeHarness, quietGame } from "./testing/harness";
import { waveSpeedFactor } from "./world";

describe("a new game", () => {
  it("opens wave 1 with four Large rocks clear of the ship and the star", async () => {
    const h = await makeHarness();
    await h.tap("Enter");
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.screen).toBe("playing");
    expect(snap.wave).toBe(1);
    expect(snap.lives).toBe(3);
    expect(snap.score).toBe(0);
    expect(snap.rocks).toHaveLength(4);
    for (const r of snap.rocks) {
      expect(r.size).toBe("large");
      expect(r.health).toBe(3);
      expect(wrappedDistance(r.x, r.y, 640, 560)).toBeGreaterThan(
        WAVE_MIN_SHIP_DIST - 5,
      );
      expect(wrappedDistance(r.x, r.y, 640, 360)).toBeGreaterThan(
        WAVE_MIN_STAR_DIST - 5,
      );
    }
  });
});

describe("the wave loop", () => {
  it("clears on the last kill, runs the banner, then spawns the next wave", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setWaveSpawning(s, true));
    h.pose((d, s) => d.addRock(s, "small", 400, 150));
    h.pose((d, s) => d.setNextRockSpeed(s, 100));
    h.pose((d, s) => d.addBullet(s, 360, 150, 600, 0));
    await h.step(10);
    let snap = h.debug.snapshot(h.engine.state);
    expect(snap.wave).toBe(2);
    expect(snap.waveBanner).toBeGreaterThan(0);
    expect(snap.rocks).toHaveLength(0);
    await h.step(Math.round(WAVE_BANNER_TIME * 120) - 12);
    expect(h.debug.snapshot(h.engine.state).rocks).toHaveLength(0);
    await h.step(10);
    snap = h.debug.snapshot(h.engine.state);
    expect(snap.waveBanner).toBe(0);
    expect(snap.rocks).toHaveLength(5);
    expect(snap.nextRockSpeed).toBeNull();
    for (const r of snap.rocks) {
      expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(100 * waveSpeedFactor(2), -1);
    }
  });

  it("does not clear on a field emptied without a kill", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setWaveSpawning(s, true));
    await h.step(10);
    expect(h.debug.snapshot(h.engine.state).wave).toBe(1);
  });

  it("puts up the wave a posed banner names, unless the gate is shut", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setWave(s, 6));
    h.pose((d, s) => d.setWaveBanner(s, 0.1));
    await h.step(20);
    expect(h.debug.snapshot(h.engine.state).rocks).toHaveLength(0);
    h.pose((d, s) => d.setWaveSpawning(s, true));
    h.pose((d, s) => d.setWaveBanner(s, 0.1));
    await h.step(20);
    expect(h.debug.snapshot(h.engine.state).rocks).toHaveLength(9);
  });

  it("scales speed by wave, capped at forty percent", () => {
    expect(waveSpeedFactor(1)).toBe(1);
    expect(waveSpeedFactor(6)).toBeCloseTo(1.2);
    expect(waveSpeedFactor(11)).toBeCloseTo(1.4);
    expect(waveSpeedFactor(30)).toBeCloseTo(1.4);
  });
});

describe("scoring", () => {
  it("grants a ship for each multiple of EXTRA_LIFE_STEP crossed", async () => {
    const h = await quietGame();
    const cues: string[] = [];
    h.engine.events.on("cue:played", (e) => cues.push(e.cue));
    h.pose((d, s) => d.setScore(s, EXTRA_LIFE_STEP - 10));
    expect(h.debug.snapshot(h.engine.state).lives).toBe(3);
    h.pose((d, s) => d.addRock(s, "small", 400, 150));
    h.pose((d, s) => d.addBullet(s, 360, 150, 600, 0));
    await h.step(10);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.score).toBe(EXTRA_LIFE_STEP + 90);
    expect(snap.lives).toBe(4);
    expect(cues).toContain(CUES.extraLife);
    expect(cues).toContain(CUES.shatter);
    expect(h.engine.state.extraLifeTimer).toBeGreaterThan(0.5);
  });
});

describe("the timestep", () => {
  it("lands in the same place whatever the frame rate", async () => {
    const run = async (ms: number, frames: number): Promise<number[]> => {
      const h = await makeHarness(ms);
      await h.tap("Enter");
      h.pose((d, s) => d.setWaveSpawning(s, false));
      h.pose((d, s) => d.setSaucerSpawning(s, false));
      h.pose((d, s) => d.clearRocks(s));
      h.pose((d, s) => d.addRock(s, "medium", 300, 300));
      const id = h.engine.state.rocks[0].id;
      h.pose((d, s) => d.setRockVelocity(s, id, 50, -20));
      h.pose((d, s) => d.addBullet(s, 900, 200, -100, 150));
      await h.step(frames);
      const snap = h.debug.snapshot(h.engine.state);
      return [
        snap.rocks[0].x,
        snap.rocks[0].y,
        snap.bullets[0].x,
        snap.bullets[0].y,
      ];
    };
    const fast = await run(1000 / 120, 120);
    const slow = await run(1000 / 30, 30);
    fast.forEach((v, i) => expect(v).toBeCloseTo(slow[i], 6));
  });
});
