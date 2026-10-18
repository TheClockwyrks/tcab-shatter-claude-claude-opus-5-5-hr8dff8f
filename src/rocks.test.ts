import { describe, expect, it } from "vitest";
import {
  HIT_FLASH_TIME,
  ROCK_SPEED_MAX,
  ROCK_SPEED_MIN,
  SCORE_MEDIUM,
  SCORE_SMALL,
  SPLIT_KICK,
} from "./constants";
import { quietGame } from "./testing/harness";

describe("armor", () => {
  it("takes three gun hits to break a Large, flashing on each chip", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "large", 400, 150));
    for (let hit = 1; hit <= 2; hit++) {
      h.pose((d, s) => d.addBullet(s, 300, 150, 600, 0));
      await h.step(12);
      const snap = h.debug.snapshot(h.engine.state);
      expect(snap.rocks).toHaveLength(1);
      expect(snap.rocks[0].health).toBe(3 - hit);
      expect(snap.bullets).toHaveLength(0);
      expect(snap.score).toBe(0);
      const flash = h.engine.state.rocks[0].flash;
      expect(flash).toBeGreaterThan(0);
      expect(flash).toBeLessThanOrEqual(HIT_FLASH_TIME);
      await h.step(20);
      expect(h.engine.state.rocks[0].flash).toBe(0);
    }
    h.pose((d, s) => d.addBullet(s, 300, 150, 600, 0));
    await h.step(12);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.rocks.map((r) => [r.size, r.health])).toEqual([
      ["medium", 2],
      ["medium", 2],
    ]);
    expect(snap.score).toBe(20);
  });

  it("splits across the shot with SPLIT_KICK, fragments appended with fresh ids", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "medium", 400, 150));
    const rock = h.debug.snapshot(h.engine.state).rocks[0];
    h.pose((d, s) => d.setRockHealth(s, rock.id, 1));
    h.pose((d, s) => d.setRockVelocity(s, rock.id, 0, 0));
    h.pose((d, s) => d.addBullet(s, 340, 150, 900, 0));
    await h.step(5);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.score).toBe(SCORE_MEDIUM);
    expect(snap.rocks).toHaveLength(2);
    const [a, b] = snap.rocks;
    expect(a.id).not.toBe(rock.id);
    expect(b.id).toBeGreaterThan(a.id);
    expect(a.size).toBe("small");
    // Perpendicular to the bullet's travel, one to each side.
    expect(a.vy - b.vy).toBeCloseTo(2 * SPLIT_KICK, -1);
    expect(Math.abs(a.vx - b.vx)).toBeLessThan(5);
  });

  it("leaves nothing behind a Small", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "small", 400, 150));
    h.pose((d, s) => d.addRock(s, "small", 900, 650));
    h.pose((d, s) => d.addBullet(s, 360, 150, 600, 0));
    await h.step(10);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.rocks).toHaveLength(1);
    expect(snap.score).toBe(SCORE_SMALL);
  });

  it("catches a bullet too fast to overlap on any one tick", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "small", 400, 100));
    h.pose((d, s) => d.addBullet(s, 380, 100, 12000, 0));
    await h.step(1);
    expect(h.debug.snapshot(h.engine.state).rocks).toHaveLength(0);
  });

  it("lets a saucer bullet pass over a rock unharmed", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "small", 400, 100));
    h.pose((d, s) => d.addEnemyBullet(s, 360, 100, 400, 0));
    await h.step(20);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.rocks).toHaveLength(1);
    expect(snap.enemyBullets).toHaveLength(1);
  });
});

describe("star recycling", () => {
  it("re-places a swallowed rock on the posed edge, keeping its health", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addRock(s, "large", 640, 300));
    const rock = h.debug.snapshot(h.engine.state).rocks[0];
    h.pose((d, s) => d.setRockHealth(s, rock.id, 2));
    h.pose((d, s) => d.setNextRecycleEdge(s, "left"));
    h.pose((d, s) => d.setNextRockSpeed(s, 77));
    await h.step(1);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.rocks).toHaveLength(1);
    const r = snap.rocks[0];
    expect(r.id).toBe(rock.id);
    expect(r.health).toBe(2);
    expect(r.x).toBeLessThan(5);
    expect(r.vx).toBeGreaterThan(0);
    expect(snap.score).toBe(0);
    expect(snap.nextRecycleEdge).toBeNull();
    expect(snap.nextRockSpeed).toBeNull();
    expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(77, 0);
  });

  it.each(["top", "bottom", "right"] as const)(
    "re-enters from the %s edge heading inward at a fresh speed",
    async (edge) => {
      const h = await quietGame();
      h.pose((d, s) => d.addRock(s, "medium", 640, 340));
      h.pose((d, s) => d.setNextRecycleEdge(s, edge));
      await h.step(1);
      const r = h.debug.snapshot(h.engine.state).rocks[0];
      const speed = Math.hypot(r.vx, r.vy);
      expect(speed).toBeGreaterThanOrEqual(ROCK_SPEED_MIN.medium - 1);
      expect(speed).toBeLessThanOrEqual(ROCK_SPEED_MAX.medium + 1);
      if (edge === "top") expect(r.vy).toBeGreaterThan(0);
      if (edge === "bottom") expect(r.vy).toBeLessThan(0);
      if (edge === "right") expect(r.vx).toBeLessThan(0);
    },
  );
});

describe("lethal contact", () => {
  it("costs a life and respawns at the safe point with grace", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipPosition(s, 200, 200));
    h.pose((d, s) => d.setTorpedoCharge(s, 0.2));
    h.pose((d, s) => d.addRock(s, "small", 220, 200));
    await h.step(1);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.lives).toBe(2);
    expect(snap.ship.x).toBe(640);
    expect(snap.ship.y).toBe(560);
    expect(snap.ship.invuln).toBeCloseTo(2.5, 6);
    expect(snap.torpedoCharge).toBe(1);
  });

  it("ignores contact through the grace and resumes when it ends", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipInvuln(s, 0.05));
    h.pose((d, s) => d.addRock(s, "small", 640, 560));
    await h.step(5);
    expect(h.debug.snapshot(h.engine.state).lives).toBe(3);
    await h.step(2);
    expect(h.debug.snapshot(h.engine.state).lives).toBe(2);
  });

  it("is skipped entirely with the contact gate off", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setShipCollision(s, false));
    h.pose((d, s) => d.addRock(s, "small", 640, 560));
    h.pose((d, s) => d.addSaucer(s, 640, 560));
    h.pose((d, s) => d.setSaucerTravel(s, false));
    h.pose((d, s) => d.addEnemyBullet(s, 640, 560, 0, 0));
    await h.step(10);
    expect(h.debug.snapshot(h.engine.state).lives).toBe(3);
  });

  it("is lost to a saucer bullet, which is removed", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addEnemyBullet(s, 600, 560, 300, 0));
    await h.step(30);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.lives).toBe(2);
    expect(snap.enemyBullets).toHaveLength(0);
  });

  it("ends the game on the last ship", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.setLives(s, 1));
    h.pose((d, s) => d.addRock(s, "small", 640, 560));
    await h.step(1);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.lives).toBe(0);
    expect(snap.screen).toBe("gameover");
  });
});
