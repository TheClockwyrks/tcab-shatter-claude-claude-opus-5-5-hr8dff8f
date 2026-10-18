import { describe, expect, it } from "vitest";
import {
  CORE_R,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRE_INTERVAL,
  SAUCER_GAP_MAX,
  SAUCER_GAP_MIN,
  SAUCER_LIFETIME,
  SAUCER_R,
  SAUCER_SPEED,
  SAUCER_WEAVE_SPEED,
  SCORE_SAUCER,
} from "./constants";
import { makeHarness, quietGame } from "./testing/harness";

describe("the saucer cadence", () => {
  it("first arrives eighteen seconds in, on the posed edge and row", async () => {
    const h = await makeHarness();
    await h.tap("Enter");
    h.pose((d, s) => d.setWaveSpawning(s, false));
    h.pose((d, s) => d.clearRocks(s));
    h.pose((d, s) => d.setNextSaucerEdge(s, "right"));
    h.pose((d, s) => d.setNextSaucerRow(s, 120));
    h.pose((d, s) => d.setShipCollision(s, false));
    await h.wait(17.9);
    expect(h.debug.snapshot(h.engine.state).saucer).toBeNull();
    await h.wait(0.2);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.saucer).not.toBeNull();
    expect(snap.saucer?.x).toBeGreaterThan(1280 - 2 * SAUCER_R - 30);
    expect(snap.saucer?.vx).toBe(-SAUCER_SPEED);
    expect(snap.saucer?.y).toBeCloseTo(120, 6);
    expect(snap.nextSaucerEdge).toBeNull();
    expect(snap.nextSaucerRow).toBeNull();
  });

  it("leaves after its lifetime and draws a fresh gap", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipCollision(s, false));
    h.pose((d, s) => d.addSaucer(s, 100, 100));
    h.pose((d, s) => d.setSaucerGun(s, false));
    await h.wait(SAUCER_LIFETIME - 0.2);
    expect(h.debug.snapshot(h.engine.state).saucer).not.toBeNull();
    await h.wait(0.3);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.saucer).toBeNull();
    expect(snap.saucerDue).toBeGreaterThanOrEqual(SAUCER_GAP_MIN);
    expect(snap.saucerDue).toBeLessThanOrEqual(SAUCER_GAP_MAX);
  });

  it("arrives once saucerClock reaches a posed due", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setSaucerSpawning(s, true));
    h.pose((d, s) => d.setSaucerDue(s, 0.5));
    await h.step(70);
    const first = h.debug.snapshot(h.engine.state).saucer;
    expect(first).not.toBeNull();
    h.pose((d, s) => d.removeSaucer(s));
    h.pose((d, s) => d.removeSaucer(s));
    await h.step(70);
    const second = h.debug.snapshot(h.engine.state).saucer;
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first?.id);
  });

  it("brings none in with its gate off", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setSaucerDue(s, 0.1));
    await h.step(30);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.saucer).toBeNull();
    expect(snap.saucerClock).toBeGreaterThan(0.1);
  });
});

describe("the saucer in flight", () => {
  it("weaves after one interval and reverses each reroll", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 100, 600));
    h.pose((d, s) => d.setSaucerGun(s, false));
    h.pose((d, s) => d.setSaucerWeave(s, -1));
    await h.step(119);
    expect(h.debug.snapshot(h.engine.state).saucer?.vy).toBe(0);
    await h.step(1);
    expect(h.debug.snapshot(h.engine.state).saucer?.vy).toBe(
      -SAUCER_WEAVE_SPEED,
    );
    await h.step(120);
    expect(h.debug.snapshot(h.engine.state).saucer?.vy).toBe(
      SAUCER_WEAVE_SPEED,
    );
  });

  it("holds its centre with travel off and its velocity with mind off", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 300, 600));
    h.pose((d, s) => d.setSaucerTravel(s, false));
    h.pose((d, s) => d.setSaucerMind(s, false));
    await h.step(150);
    const saucer = h.debug.snapshot(h.engine.state).saucer;
    expect(saucer?.x).toBe(300);
    expect(saucer?.y).toBe(600);
    expect(saucer?.vy).toBe(0);
  });

  it("fires at the ship with the posed aim error", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 340, 560));
    h.pose((d, s) => d.setSaucerTravel(s, false));
    h.pose((d, s) => d.setSaucerMind(s, false));
    h.pose((d, s) => d.setNextSaucerAim(s, 0));
    await h.step(Math.round(SAUCER_FIRE_INTERVAL * 120));
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.enemyBullets).toHaveLength(1);
    expect(snap.nextSaucerAim).toBeNull();
    const b = snap.enemyBullets[0];
    expect(b.vx).toBeCloseTo(SAUCER_BULLET_SPEED + 140, 0);
    expect(Math.abs(b.vy)).toBeLessThan(5);
  });

  it("never lets its circle touch the core on a crossing along the star's row", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 300, 360));
    h.pose((d, s) => d.setSaucerGun(s, false));
    let closest = Infinity;
    for (let i = 0; i < 400; i++) {
      await h.step(1);
      const s = h.debug.snapshot(h.engine.state).saucer;
      if (s) closest = Math.min(closest, Math.hypot(s.x - 640, s.y - 360));
    }
    expect(closest).toBeGreaterThanOrEqual(CORE_R + SAUCER_R);
  });

  it("is destroyed by a bullet for SCORE_SAUCER, and a rock passes through it", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 400, 120));
    h.pose((d, s) => d.setSaucerTravel(s, false));
    h.pose((d, s) => d.setSaucerGun(s, false));
    h.pose((d, s) => d.addRock(s, "small", 400, 120));
    await h.step(10);
    expect(h.debug.snapshot(h.engine.state).saucer).not.toBeNull();
    h.pose((d, s) => d.clearRocks(s));
    h.pose((d, s) => d.addBullet(s, 340, 120, 600, 0));
    await h.step(10);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.saucer).toBeNull();
    expect(snap.bullets).toHaveLength(0);
    expect(snap.score).toBe(SCORE_SAUCER);
  });

  it("costs the ship a life on contact", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 600, 560));
    await h.step(30);
    expect(h.debug.snapshot(h.engine.state).lives).toBe(2);
  });
});
