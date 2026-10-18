/* global window, console */
// Shatter — captures the showcase media into showcase/.
//
//   node tools/capture/run.mjs
//
// Serves the capture rig (tools/capture/index.html) with Vite, opens it in
// headless Chromium, and flies real games with the rig's autopilot. A segment
// is kept only when it is clean live play: the score rose and no ship was lost.

import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "showcase");
mkdirSync(out, { recursive: true });

const server = await createServer({
  root,
  logLevel: "error",
  server: { port: 5199, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (error) => console.error("page error:", String(error)));
await page.goto("http://localhost:5199/tools/capture/index.html");
await page.evaluate(() => window.rigReady);

const status = () =>
  page.evaluate(() => {
    const s = window.rig.engine.state;
    return {
      screen: s.screen,
      score: s.score,
      lives: s.lives,
      saucer: s.saucer !== null,
      due: s.saucerDue - s.saucerClock,
      torpedoes: s.torpedoes.length,
    };
  });

const shoot = (name) =>
  page.locator("#stage").screenshot({ path: join(out, name) });

async function saveRecording(name, frames) {
  const json = await page.evaluate(async (count) => {
    window.rig.engine.startRecording();
    await window.rig.fly(count);
    return JSON.stringify(window.rig.engine.stopRecording());
  }, frames);
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(join(out, name), gz);
  console.log(`${name}: ${(gz.length / 1048576).toFixed(2)} MiB`);
}

async function newGame() {
  await page.evaluate(async () => {
    const rig = window.rig;
    rig.release();
    if (rig.engine.state.screen === "playing") await rig.tap("KeyP");
    if (rig.engine.state.screen !== "title") {
      // Quit to the title from the pause menu or the game-over menu.
      const items = rig.engine.state.screen === "paused" ? 3 : 2;
      for (let i = 0; i < items - 1; i++) await rig.tap("ArrowDown");
      await rig.tap("Enter");
    }
    await rig.engine.advance(30);
    await rig.tap("Enter");
  });
}

// The title screen, with the star and the dimmed rocks behind the menu.
await page.evaluate(() => window.rig.engine.advance(150));
await shoot("title.png");

// Live play: the gun and the torpedo breaking up the opening wave.
let kept = false;
for (let attempt = 0; attempt < 12 && !kept; attempt++) {
  await newGame();
  await page.evaluate(() => window.rig.fly(60));
  const before = await status();
  await saveRecording("play.json.gz", 480);
  const after = await status();
  kept =
    after.screen === "playing" &&
    after.lives === before.lives &&
    after.score >= before.score + 100;
  console.log(`play attempt ${attempt}: ${kept ? "kept" : "retry"}`, after);
}

// A still of the field in play, for the description.
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => window.rig.fly(6));
  const shots = await page.evaluate(
    () => window.rig.engine.state.bullets.length,
  );
  if (shots >= 2) break;
}
await shoot("field.png");

// The saucer arriving to hunt.
kept = false;
for (let attempt = 0; attempt < 12 && !kept; attempt++) {
  let s = await status();
  if (attempt > 0 || s.screen !== "playing") await newGame();
  s = await status();
  while (s.screen === "playing" && (s.saucer || s.due > 0.8)) {
    await page.evaluate(() => window.rig.fly(12));
    s = await status();
  }
  if (s.screen !== "playing") continue;
  await saveRecording("saucer.json.gz", 480);
  const after = await status();
  kept = after.screen === "playing" && after.lives === s.lives;
  console.log(`saucer attempt ${attempt}: ${kept ? "kept" : "retry"}`, after);
}

await browser.close();
await server.close();
