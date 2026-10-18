import { describe, expect, it } from "vitest";
import {
  SCORE_LARGE,
  SHIP_R,
  TORPEDO_LIFE,
  TORPEDO_SCATTER,
  TORPEDO_SPEED,
  TORPEDO_TURN,
  TICK_DT,
} from "./constants";
import { quietGame } from "./testing/harness";

describe("the torpedo", () => {
  it("launches from the nose at TORPEDO_SPEED, carrying none of the ship's drift", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 200, 600));
    h.pose((d, s) => d.setShipVelocity(s, 0, -200));
    h.pose((d, s) => d.setShipAngle(s, 0));
    await h.tap("KeyF");
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.torpedoes).toHaveLength(1);
    const t = snap.torpedoes[0];
    expect(t.vx).toBeCloseTo(TORPEDO_SPEED, 6);
    expect(t.vy).toBeCloseTo(0, 6);
    expect(t.heading).toBe(0);
    expect(t.homing).toBe(true);
    expect(
      Math.hypot(t.x - snap.ship.x, t.y - snap.ship.y),
    ).toBeLessThanOrEqual(SHIP_R);
    expect(snap.torpedoCharge).toBe(0);
    expect(snap.torpedoReady).toBe(false);
  });

  it("recharges linearly over ten seconds and will not launch before then", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 200, 650));
    h.pose((d, s) => d.setShipAngle(s, Math.PI));
    await h.tap("KeyF");
    h.pose((d, s) => d.clearTorpedoes(s));
    await h.wait(5);
    expect(h.debug.snapshot(h.engine.state).torpedoCharge).toBeCloseTo(0.5, 6);
    await h.tap("KeyF");
    expect(h.debug.snapshot(h.engine.state).torpedoes).toHaveLength(0);
    await h.wait(5);
    expect(h.debug.snapshot(h.engine.state).torpedoReady).toBe(true);
  });

  it("launches nothing while one is in flight", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addTorpedo(s, 100, 100, 0));
    await h.tap("KeyF");
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.torpedoes).toHaveLength(1);
    expect(snap.torpedoCharge).toBe(1);
  });

  it("flies straight through the well and expires", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addTorpedo(s, 640, 200, 0));
    await h.step(60);
    const t = h.debug.snapshot(h.engine.state).torpedoes[0];
    expect(t.y).toBeCloseTo(200, 9);
    expect(t.vy).toBeCloseTo(0, 9);
    await h.wait(TORPEDO_LIFE);
    expect(h.debug.snapshot(h.engine.state).torpedoes).toHaveLength(0);
  });

  it("homes onto the nearest body inside its forward cone", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "small", 700, 140));
    h.pose((d, s) => d.addTorpedo(s, 300, 100, 0));
    await h.step(1);
    const t = h.debug.snapshot(h.engine.state).torpedoes[0];
    expect(t.heading).toBeCloseTo(TORPEDO_TURN * TICK_DT, 9);
    expect(Math.hypot(t.vx, t.vy)).toBeCloseTo(TORPEDO_SPEED, 9);
  });

  it("never acquires a body outside the cone or behind it", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "small", 200, 100));
    h.pose((d, s) => d.addRock(s, "small", 500, 300));
    h.pose((d, s) => d.addTorpedo(s, 300, 100, 0));
    await h.step(10);
    expect(h.debug.snapshot(h.engine.state).torpedoes[0].heading).toBe(0);
  });

  it("holds its heading with guidance off", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "small", 700, 140));
    h.pose((d, s) => d.addTorpedo(s, 300, 100, 0));
    const id = h.debug.snapshot(h.engine.state).torpedoes[0].id;
    h.pose((d, s) => d.setTorpedoHoming(s, id, false));
    await h.step(5);
    expect(h.debug.snapshot(h.engine.state).torpedoes[0].heading).toBe(0);
  });

  it("destroys a Large outright and fans the fragments along its line", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "large", 300, 600));
    h.pose((d, s) => d.addTorpedo(s, 200, 600, 0));
    await h.step(20);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.torpedoes).toHaveLength(0);
    expect(snap.score).toBe(SCORE_LARGE);
    expect(snap.rocks.map((r) => r.size)).toEqual(["medium", "medium"]);
    expect(snap.rocks.map((r) => r.health)).toEqual([2, 2]);
    const [a, b] = snap.rocks;
    expect(a.vx - b.vx).toBeCloseTo(2 * TORPEDO_SCATTER, -1);
    expect(Math.abs(a.vy - b.vy)).toBeLessThan(20);
  });

  it("destroys the saucer for its score, and the core absorbs it", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 400, 650));
    h.pose((d, s) => d.setSaucerTravel(s, false));
    h.pose((d, s) => d.setSaucerGun(s, false));
    h.pose((d, s) => d.addTorpedo(s, 300, 650, 0));
    await h.step(30);
    let snap = h.debug.snapshot(h.engine.state);
    expect(snap.saucer).toBeNull();
    expect(snap.score).toBe(200);
    h.pose((d, s) => d.addTorpedo(s, 500, 360, 0));
    await h.step(60);
    snap = h.debug.snapshot(h.engine.state);
    expect(snap.torpedoes).toHaveLength(0);
    expect(snap.score).toBe(200);
  });

  it("passes through the ship harmlessly", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 300, 650));
    h.pose((d, s) => d.addTorpedo(s, 250, 650, 0));
    await h.step(30);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.lives).toBe(3);
    expect(snap.torpedoes).toHaveLength(1);
  });
});
