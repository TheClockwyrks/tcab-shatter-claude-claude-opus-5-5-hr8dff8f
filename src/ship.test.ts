import { describe, expect, it } from "vitest";
import {
  BULLET_LIFE,
  FIRE_INTERVAL_TICKS,
  MAX_BULLETS,
  MUZZLE_SPEED,
  SHIP_MAX,
  SHIP_R,
  SHIP_THRUST,
  SHIP_TURN,
  TICK_DT,
} from "./constants";
import { quietGame } from "./testing/harness";

describe("inertial flight", () => {
  it("turns at SHIP_TURN without touching the velocity", async () => {
    const h = await quietGame();
    const before = h.debug.snapshot(h.engine.state).ship.angle;
    h.keyDown("ArrowRight");
    await h.step(60);
    const ship = h.debug.snapshot(h.engine.state).ship;
    expect(ship.angle - before).toBeCloseTo(SHIP_TURN * 0.5, 6);
    expect(ship.speed).toBe(0);
    h.keyUp("ArrowRight");
    h.keyDown("KeyA");
    await h.step(30);
    expect(h.debug.snapshot(h.engine.state).ship.angle).toBeCloseTo(
      ship.angle - SHIP_TURN * 0.25,
      6,
    );
  });

  it("thrusts along the facing and drags by half every three seconds", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 200, 600));
    h.pose((d, s) => d.setShipAngle(s, 0));
    h.keyDown("ArrowUp");
    await h.step(1);
    let ship = h.debug.snapshot(h.engine.state).ship;
    expect(ship.thrusting).toBe(true);
    const drag = Math.pow(0.5, TICK_DT / 3);
    expect(ship.vx).toBeCloseTo(SHIP_THRUST * TICK_DT * drag, 9);
    expect(ship.vy).toBeCloseTo(0, 9);
    h.keyUp("ArrowUp");
    h.pose((d, s) => d.setShipVelocity(s, 100, 0));
    await h.step(360);
    ship = h.debug.snapshot(h.engine.state).ship;
    expect(ship.thrusting).toBe(false);
    expect(ship.vx).toBeCloseTo(50, 6);
  });

  it("caps the speed at SHIP_MAX", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 100, 100));
    h.pose((d, s) => d.setShipAngle(s, 0));
    h.pose((d, s) => d.setShipVelocity(s, 900, 0));
    h.keyDown("ArrowUp");
    await h.step(2);
    expect(h.debug.snapshot(h.engine.state).ship.speed).toBeCloseTo(
      SHIP_MAX,
      6,
    );
  });

  it("is never pulled by the star", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 540, 360));
    h.pose((d, s) => d.setShipVelocity(s, 0, 0));
    await h.step(120);
    const ship = h.debug.snapshot(h.engine.state).ship;
    expect(ship.x).toBe(540);
    expect(ship.y).toBe(360);
  });

  it("wraps at the edges carrying its velocity", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 1278, 100));
    h.pose((d, s) => d.setShipVelocity(s, 240, 0));
    await h.step(2);
    const ship = h.debug.snapshot(h.engine.state).ship;
    expect(ship.x).toBeLessThan(5);
    expect(ship.vx).toBeGreaterThan(239);
  });

  it("slides along the core without losing a life", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 640, 420));
    h.pose((d, s) => d.setShipVelocity(s, 60, -300));
    await h.step(30);
    const snap = h.debug.snapshot(h.engine.state);
    const dist = Math.hypot(snap.ship.x - 640, snap.ship.y - 360);
    expect(dist).toBeGreaterThanOrEqual(44 - 1e-6);
    expect(snap.lives).toBe(3);
    expect(snap.ship.vx).toBeGreaterThan(0);
  });
});

describe("the gun", () => {
  it("fires from the nose with the ship's velocity plus the muzzle speed", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 300, 600));
    h.pose((d, s) => d.setShipVelocity(s, 30, 0));
    h.pose((d, s) => d.setShipAngle(s, 0));
    await h.tap("Space");
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.bullets).toHaveLength(1);
    const b = snap.bullets[0];
    const ahead = b.x - snap.ship.x;
    expect(ahead).toBeGreaterThan(0);
    expect(ahead).toBeLessThanOrEqual(SHIP_R);
    expect(b.vx).toBeCloseTo(snap.ship.vx + MUZZLE_SPEED, 0);
    expect(b.life).toBeCloseTo(BULLET_LIFE - TICK_DT, 6);
    expect(snap.ship.fireCooldown).toBe(FIRE_INTERVAL_TICKS);
  });

  it("holds to fire on the gate, at most four in flight", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 100, 650));
    h.pose((d, s) => d.setShipAngle(s, 0));
    h.keyDown("Space");
    await h.step(1);
    await h.step(FIRE_INTERVAL_TICKS - 1);
    expect(h.debug.snapshot(h.engine.state).bullets).toHaveLength(1);
    await h.step(1);
    expect(h.debug.snapshot(h.engine.state).bullets).toHaveLength(2);
    await h.step(FIRE_INTERVAL_TICKS * 6);
    expect(h.debug.snapshot(h.engine.state).bullets.length).toBeLessThanOrEqual(
      MAX_BULLETS,
    );
  });

  it("removes a bullet when its life runs out", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addBullet(s, 100, 100, 0, 0));
    await h.step(Math.round(BULLET_LIFE / TICK_DT) - 1);
    expect(h.debug.snapshot(h.engine.state).bullets).toHaveLength(1);
    await h.step(1);
    expect(h.debug.snapshot(h.engine.state).bullets).toHaveLength(0);
  });

  it("bends a shot through the well and the core absorbs it", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addBullet(s, 640, 160, 300, 0));
    await h.step(1);
    const b = h.debug.snapshot(h.engine.state).bullets[0];
    expect(b.vy).toBeGreaterThan(0);
    h.pose((d, s) => d.clearBullets(s));
    h.pose((d, s) => d.addBullet(s, 640, 260, 0, 400));
    await h.step(40);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.bullets).toHaveLength(0);
    expect(snap.score).toBe(0);
  });
});
