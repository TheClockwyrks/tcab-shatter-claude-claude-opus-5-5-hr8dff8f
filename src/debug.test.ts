import { describe, expect, it } from "vitest";
import { createDebugApi } from "./debug";
import { makeHarness, quietGame } from "./testing/harness";
import { titleState } from "./world";

const debug = createDebugApi();

describe("the debug surface", () => {
  it("reports exactly the snapshot shape", () => {
    const snap = debug.snapshot(titleState(false));
    expect(Object.keys(snap).sort()).toEqual(
      [
        "version",
        "screen",
        "menuIndex",
        "score",
        "lives",
        "wave",
        "waveBanner",
        "muted",
        "waveSpawning",
        "saucerSpawning",
        "saucerClock",
        "saucerDue",
        "nextSaucerEdge",
        "nextSaucerRow",
        "nextSaucerAim",
        "nextRockSpeed",
        "nextRecycleEdge",
        "ship",
        "bullets",
        "rocks",
        "saucer",
        "enemyBullets",
        "torpedoes",
        "torpedoCharge",
        "torpedoReady",
        "simTime",
      ].sort(),
    );
    expect(snap.version).toBe(1);
    expect(snap.lives).toBe(3);
    expect(snap.torpedoReady).toBe(true);
    expect(snap.saucerDue).toBe(18);
  });

  it("leaves the state it was handed as it was", () => {
    const s = titleState(false);
    const before = JSON.stringify(s);
    debug.addRock(s, "large", 10, 10);
    debug.setShipPosition(s, 1, 2);
    debug.addSaucer(s, 5, 5);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("fails loudly on an argument it has no state for", () => {
    const s = titleState(false);
    expect(() => debug.setShipPosition(s, Number.NaN, 0)).toThrow();
    expect(() => debug.setScore(s, Infinity)).toThrow();
    expect(() => debug.setScreen(s, "nowhere" as never)).toThrow();
    expect(() => debug.addRock(s, "huge" as never, 0, 0)).toThrow();
    expect(() => debug.removeRock(s, 99)).toThrow();
    expect(() => debug.removeBullet(s, 99)).toThrow();
    expect(() => debug.removeEnemyBullet(s, 99)).toThrow();
    expect(() => debug.removeTorpedo(s, 99)).toThrow();
    expect(() => debug.setSaucerVelocity(s, 1, 1)).toThrow();
    expect(() =>
      debug.setSaucerWeave(debug.addSaucer(s, 1, 1), 2 as never),
    ).toThrow();
    expect(() => debug.setNextSaucerEdge(s, "top" as never)).toThrow();
    expect(() => debug.setNextRecycleEdge(s, "middle" as never)).toThrow();
    expect(() => debug.setWaveSpawning(s, "yes" as never)).toThrow();
    expect(() => debug.removeSaucer(s)).not.toThrow();
  });

  it("poses and reads back every field", () => {
    let s = titleState(false);
    s = debug.setScreen(s, "playing");
    s = debug.setMenuIndex(s, 2);
    s = debug.setScore(s, 1234);
    s = debug.setLives(s, 5);
    s = debug.setWave(s, 7);
    s = debug.setWaveBanner(s, 0.7);
    s = debug.setWaveSpawning(s, false);
    s = debug.setSaucerSpawning(s, false);
    s = debug.setSaucerDue(s, 3);
    s = debug.setShipPosition(s, 10, 20);
    s = debug.setShipVelocity(s, 3, 4);
    s = debug.setShipAngle(s, 1);
    s = debug.setShipInvuln(s, 1.5);
    s = debug.setFireCooldown(s, 9);
    s = debug.setShipCollision(s, false);
    s = debug.setNextSaucerEdge(s, "left");
    s = debug.setNextSaucerRow(s, 44);
    s = debug.setNextSaucerAim(s, 0.1);
    s = debug.setNextRockSpeed(s, 66);
    s = debug.setNextRecycleEdge(s, "bottom");
    s = debug.setTorpedoCharge(s, 0.3);
    s = debug.addRock(s, "medium", 100, 100);
    s = debug.setRockVelocity(s, s.rocks[0].id, 5, 6);
    s = debug.setRockHealth(s, s.rocks[0].id, 1);
    s = debug.addBullet(s, 1, 2, 3, 4);
    s = debug.addEnemyBullet(s, 5, 6, 7, 8);
    s = debug.addTorpedo(s, 9, 10, 0);
    s = debug.setTorpedoHeading(s, s.torpedoes[0].id, Math.PI / 2);
    s = debug.setTorpedoHoming(s, s.torpedoes[0].id, false);
    s = debug.addSaucer(s, 300, 300);
    s = debug.setSaucerVelocity(s, -10, 5);
    s = debug.setSaucerWeave(s, -1);
    s = debug.setSaucerMind(s, false);
    s = debug.setSaucerGun(s, false);
    s = debug.setSaucerTravel(s, false);
    const snap = debug.snapshot(s);
    expect(snap).toMatchObject({
      screen: "playing",
      menuIndex: 2,
      score: 1234,
      lives: 5,
      wave: 7,
      waveBanner: 0.7,
      waveSpawning: false,
      saucerSpawning: false,
      saucerDue: 3,
      nextSaucerEdge: "left",
      nextSaucerRow: 44,
      nextSaucerAim: 0.1,
      nextRockSpeed: 66,
      nextRecycleEdge: "bottom",
      torpedoCharge: 0.3,
      torpedoReady: false,
      ship: {
        x: 10,
        y: 20,
        vx: 3,
        vy: 4,
        speed: 5,
        angle: 1,
        invuln: 1.5,
        fireCooldown: 9,
        collision: false,
      },
      rocks: [{ size: "medium", radius: 26, vx: 5, vy: 6, health: 1 }],
      bullets: [{ x: 1, y: 2, vx: 3, vy: 4, life: 1.5 }],
      enemyBullets: [{ x: 5, y: 6, vx: 7, vy: 8, life: 1.4 }],
      saucer: {
        x: 300,
        y: 300,
        vx: -10,
        vy: 5,
        weave: -1,
        mind: false,
        gun: false,
        travel: false,
        fireClock: 1.6,
        weaveClock: 1,
        age: 0,
      },
    });
    expect(snap.torpedoes[0].vy).toBeCloseTo(420, 9);
    expect(snap.torpedoes[0].homing).toBe(false);
    const ids = [
      ...snap.rocks,
      ...snap.bullets,
      ...snap.enemyBullets,
      ...snap.torpedoes,
      snap.saucer,
    ].map((e) => e?.id);
    expect(new Set(ids).size).toBe(ids.length);

    s = debug.removeRock(s, s.rocks[0].id);
    s = debug.removeBullet(s, s.bullets[0].id);
    s = debug.removeEnemyBullet(s, s.enemyBullets[0].id);
    s = debug.removeTorpedo(s, s.torpedoes[0].id);
    s = debug.removeSaucer(s);
    s = debug.clearBullets(debug.clearEnemyBullets(debug.clearTorpedoes(s)));
    const after = debug.snapshot(s);
    expect(after.rocks).toEqual([]);
    expect(after.saucer).toBeNull();
    expect(debug.reconcile(s)).toEqual(s);

    const reset = debug.snapshot(debug.reset(s));
    expect(reset).toEqual(debug.snapshot(titleState(false)));
  });

  it("keeps muted across a reset", async () => {
    const h = await makeHarness();
    await h.tap("KeyM");
    h.pose((d, s) => d.reset(s));
    expect(h.debug.snapshot(h.engine.state).muted).toBe(true);
  });

  it("registers the diagnostic sources", async () => {
    const h = await quietGame();
    h.pose((d, s) => d.addSaucer(s, 100, 100));
    const readings = h.engine.diagnostics();
    const names = readings.map((r) => r.name);
    for (const name of [
      "screen",
      "score",
      "lives",
      "wave",
      "ship pos",
      "ship vel",
      "ship speed",
      "ship facing",
      "ship grace",
      "bullets",
      "rocks",
      "saucer up",
      "saucer pos",
      "torpedo charge",
      "torpedoes",
      "sim time",
    ]) {
      expect(names).toContain(name);
    }
    expect(readings.every((r) => r.error === undefined)).toBe(true);
    expect(readings.find((r) => r.name === "saucer up")?.value).toBe(true);
  });
});
