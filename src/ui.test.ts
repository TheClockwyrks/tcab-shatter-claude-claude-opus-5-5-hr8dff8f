import { describe, expect, it } from "vitest";
import { CUES } from "./constants";
import { makeHarness } from "./testing/harness";

describe("the title menu", () => {
  it("wraps the highlight at both ends", async () => {
    const h = await makeHarness();
    await h.tap("ArrowUp");
    expect(h.engine.state.menuIndex).toBe(1);
    await h.tap("KeyS");
    expect(h.engine.state.menuIndex).toBe(0);
    await h.tap("Escape");
    expect(h.engine.state.screen).toBe("title");
  });

  it("opens how-to and returns with HOW TO PLAY highlighted", async () => {
    const h = await makeHarness();
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.engine.state.screen).toBe("howto");
    expect(h.debug.menuItemRect(h.engine.state, 0)).toBeNull();
    await h.tap("Escape");
    expect(h.engine.state.screen).toBe("title");
    expect(h.engine.state.menuIndex).toBe(1);
    await h.tap("Enter");
    await h.tap("Space");
    expect(h.engine.state.screen).toBe("title");
  });
});

describe("pausing", () => {
  it("freezes the field and resumes on a single Escape or P", async () => {
    const h = await makeHarness();
    await h.tap("Enter");
    await h.tap("Escape");
    const frozen = h.debug.snapshot(h.engine.state);
    expect(frozen.screen).toBe("paused");
    await h.step(60);
    const later = h.debug.snapshot(h.engine.state);
    expect(later.rocks).toEqual(frozen.rocks);
    expect(later.simTime).toBeGreaterThan(frozen.simTime);
    await h.tap("Escape");
    expect(h.engine.state.screen).toBe("playing");
    await h.tap("KeyP");
    expect(h.engine.state.screen).toBe("paused");
    await h.tap("KeyP");
    expect(h.engine.state.screen).toBe("playing");
  });

  it("restarts and quits from the pause menu", async () => {
    const h = await makeHarness();
    await h.tap("Enter");
    h.pose((d, s) => d.setScore(s, 500));
    await h.tap("KeyP");
    await h.tap("ArrowDown");
    await h.tap("Enter");
    let snap = h.debug.snapshot(h.engine.state);
    expect(snap.screen).toBe("playing");
    expect(snap.score).toBe(0);
    await h.tap("KeyP");
    await h.tap("ArrowUp");
    await h.tap("Enter");
    snap = h.debug.snapshot(h.engine.state);
    expect(snap.screen).toBe("title");
    expect(snap.menuIndex).toBe(0);
  });
});

describe("game over", () => {
  it("plays again or returns to the menu", async () => {
    const h = await makeHarness();
    h.pose((d, s) => d.setScreen(s, "gameover"));
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.engine.state.screen).toBe("title");
    h.pose((d, s) => d.setScreen(s, "gameover"));
    await h.tap("Escape");
    expect(h.engine.state.screen).toBe("title");
    h.pose((d, s) => d.setScreen(s, "gameover"));
    h.pose((d, s) => d.setMenuIndex(s, 0));
    await h.tap("Enter");
    expect(h.engine.state.screen).toBe("playing");
  });
});

describe("pointer and touch", () => {
  const centre = (r: { x: number; y: number; w: number; h: number } | null) => {
    if (r === null) throw new Error("no region");
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  it("highlights on hover and confirms a press and release in one entry", async () => {
    const h = await makeHarness();
    const howto = centre(h.debug.menuItemRect(h.engine.state, 1));
    h.pointer("pointermove", howto.x, howto.y);
    await h.step(1);
    expect(h.engine.state.menuIndex).toBe(1);
    h.pointer("pointerdown", howto.x, howto.y);
    h.pointer("pointerup", howto.x, howto.y);
    await h.step(1);
    expect(h.engine.state.screen).toBe("howto");
  });

  it("confirms nothing when the press and release fall in different entries", async () => {
    const h = await makeHarness();
    const play = centre(h.debug.menuItemRect(h.engine.state, 0));
    const howto = centre(h.debug.menuItemRect(h.engine.state, 1));
    h.pointer("pointerdown", play.x, play.y);
    await h.step(1);
    h.pointer("pointermove", howto.x, howto.y);
    h.pointer("pointerup", howto.x, howto.y);
    await h.step(1);
    expect(h.engine.state.screen).toBe("title");
    expect(h.engine.state.menuIndex).toBe(1);
  });

  it("confirms a touch that lands and lifts inside one entry", async () => {
    const h = await makeHarness();
    const play = centre(h.debug.menuItemRect(h.engine.state, 0));
    h.pointer("pointerdown", play.x, play.y, "touch", 7);
    await h.step(1);
    h.pointer("pointerup", play.x, play.y, "touch", 7);
    await h.step(1);
    expect(h.engine.state.screen).toBe("playing");
  });

  it("lets a key confirm win over a pointer confirm on one frame", async () => {
    const h = await makeHarness();
    const howto = centre(h.debug.menuItemRect(h.engine.state, 1));
    h.keyDown("Enter");
    h.pointer("pointerdown", howto.x, howto.y);
    h.pointer("pointerup", howto.x, howto.y);
    await h.step(1);
    expect(h.engine.state.screen).toBe("playing");
  });

  it("reports no region for an index outside the menu", async () => {
    const h = await makeHarness();
    expect(h.debug.menuItemRect(h.engine.state, 2)).toBeNull();
    expect(h.debug.menuItemRect(h.engine.state, -1)).toBeNull();
    h.pose((d, s) => d.setScreen(s, "paused"));
    expect(h.debug.menuItemRect(h.engine.state, 2)).not.toBeNull();
  });
});

describe("audio", () => {
  it("plays fire, holds thrust, and toggles mute from any screen", async () => {
    const h = await makeHarness();
    const played: string[] = [];
    const looped: string[] = [];
    const stopped: string[] = [];
    h.engine.events.on("cue:played", (e) => played.push(e.cue));
    h.engine.events.on("cue:looped", (e) => looped.push(e.cue));
    h.engine.events.on("cue:stopped", (e) => stopped.push(e.cue));
    await h.tap("KeyM");
    expect(h.debug.snapshot(h.engine.state).muted).toBe(true);
    await h.tap("KeyM");
    expect(h.debug.snapshot(h.engine.state).muted).toBe(false);
    await h.tap("Enter");
    h.pose((d, s) => d.clearRocks(s));
    await h.tap("Space");
    expect(played).toContain(CUES.fire);
    h.keyDown("ArrowUp");
    await h.step(5);
    expect(looped).toEqual([CUES.thrust]);
    h.keyUp("ArrowUp");
    await h.step(1);
    expect(stopped).toEqual([CUES.thrust]);
  });

  it("announces a saucer arrival and the ship's death", async () => {
    const h = await makeHarness();
    const played: string[] = [];
    h.engine.events.on("cue:played", (e) => played.push(e.cue));
    await h.tap("Enter");
    h.pose((d, s) => d.clearRocks(s));
    h.pose((d, s) => d.setSaucerDue(s, 0.05));
    h.pose((d, s) => d.addEnemyBullet(s, 640, 560, 0, 0));
    await h.step(10);
    expect(played).toContain(CUES.saucer);
    expect(played).toContain(CUES.death);
  });
});
