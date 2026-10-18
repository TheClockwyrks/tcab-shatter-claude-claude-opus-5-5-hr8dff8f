// Shatter — drawing. Everything here reads the state it is handed and draws it
// in logical 1280x720 units; nothing here changes the state or feeds back into
// the simulation.

import type { DeepReadonly } from "ts-essentials";
import {
  BULLET_LIFE,
  CORE_R,
  FIELD_H,
  FIELD_W,
  HALO_R,
  INVULN_TIME,
  ROCK_HEALTH,
  ROCK_RADIUS,
  SAUCER_BULLET_LIFE,
  SAUCER_R,
  SHIP_R,
  STAR_X,
  STAR_Y,
  TAGLINE_TEXT,
  TICK_DT,
  TITLE_TEXT,
  TORPEDO_R,
  TRAIL_TICKS,
  type RockSize,
} from "./constants";
import type {
  BulletState,
  EffectState,
  RockState,
  SaucerState,
  ShatterState,
  TorpedoState,
} from "./game";
import { hash01 } from "./geometry";
import { menuItems, menuRect } from "./menu";
import { gravityAt } from "./sim";

type View = DeepReadonly<ShatterState>;
type Ctx = CanvasRenderingContext2D;

/** The field's deep-space background. */
export const FIELD_COLOR = "#05070f";

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Consolas', 'Menlo', 'DejaVu Sans Mono', monospace";

const COLOR = {
  ship: "#7ef9ff",
  shipFill: "#0d2a33",
  flame: "#ffb347",
  flameCore: "#fff4c2",
  rockFill: "#3a3530",
  rockEdge: "#bfae96",
  rockHurt: "#ff6a3d",
  saucer: "#b6ff5c",
  saucerDark: "#2c4a10",
  bullet: "#fff7cf",
  bulletTrail: "255, 236, 150",
  enemyBullet: "#ff4f8b",
  enemyTrail: "255, 79, 139",
  torpedo: "#ff7a1a",
  hud: "#e9f4ff",
  hudDim: "#7d8ba6",
  accent: "#ffcf5a",
} as const;

// ---- Backdrop ----------------------------------------------------------------

interface Speck {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}

/** A fixed scatter of distant stars, the same on every frame. */
const SPECKS: readonly Speck[] = Array.from({ length: 170 }, (_, i) => ({
  x: hash01(i, 1) * FIELD_W,
  y: hash01(i, 2) * FIELD_H,
  r: 0.4 + hash01(i, 3) * 1.1,
  a: 0.18 + hash01(i, 4) * 0.5,
}));

function drawBackdrop(ctx: Ctx, time: number): void {
  ctx.fillStyle = FIELD_COLOR;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  nebula(ctx, 250, 170, 330, "60, 40, 120", 0.16);
  nebula(ctx, 1060, 560, 300, "20, 90, 120", 0.13);
  for (let i = 0; i < SPECKS.length; i++) {
    const s = SPECKS[i];
    const twinkle =
      0.75 + 0.25 * Math.sin(time * (0.6 + hash01(i, 5) * 1.8) + i);
    ctx.globalAlpha = s.a * twinkle;
    ctx.fillStyle = "#cfe0ff";
    ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
  }
  ctx.globalAlpha = 1;
}

/** A faint cloud of colour, filled over its own extent alone. */
function nebula(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  rgb: string,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(ctx: Ctx, time: number): void {
  const reach = HALO_R * 1.5;
  const halo = ctx.createRadialGradient(
    STAR_X,
    STAR_Y,
    CORE_R,
    STAR_X,
    STAR_Y,
    reach,
  );
  halo.addColorStop(0, "rgba(255, 196, 92, 0.55)");
  halo.addColorStop(0.25, "rgba(255, 140, 50, 0.26)");
  halo.addColorStop(0.6, "rgba(200, 70, 40, 0.08)");
  halo.addColorStop(1, "rgba(160, 40, 40, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(STAR_X, STAR_Y, reach, 0, Math.PI * 2);
  ctx.fill();

  // Faint rings of the well, drawn well inside the halo's reach.
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const phase = (time * 0.18 + i / 3) % 1;
    const r = CORE_R + 10 + (1 - phase) * (HALO_R - CORE_R);
    ctx.strokeStyle = `rgba(255, 190, 110, ${0.16 * phase})`;
    ctx.beginPath();
    ctx.arc(STAR_X, STAR_Y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const pulse = 1 + 0.04 * Math.sin(time * 3.1);
  const core = ctx.createRadialGradient(
    STAR_X,
    STAR_Y,
    0,
    STAR_X,
    STAR_Y,
    CORE_R * pulse,
  );
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.45, "#fff2c4");
  core.addColorStop(0.85, "#ffc061");
  core.addColorStop(1, "#ff9a3c");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(STAR_X, STAR_Y, CORE_R * pulse, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Wrapping -------------------------------------------------------------------

/** Draw `paint` at `(x, y)` and at each wrapped duplicate a shape of `reach` needs. */
function wrapped(
  x: number,
  y: number,
  reach: number,
  paint: (x: number, y: number) => void,
): void {
  const xs = [x];
  if (x - reach < 0) xs.push(x + FIELD_W);
  if (x + reach > FIELD_W) xs.push(x - FIELD_W);
  const ys = [y];
  if (y - reach < 0) ys.push(y + FIELD_H);
  if (y + reach > FIELD_H) ys.push(y - FIELD_H);
  for (const px of xs) for (const py of ys) paint(px, py);
}

// ---- Bodies ------------------------------------------------------------------

/** A rock's outline as unit-radius offsets, fixed by its id. */
function rockOutline(id: number): readonly { x: number; y: number }[] {
  const count = 10 + Math.floor(hash01(id, 11) * 4);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (hash01(id, 40 + i) - 0.5) * 0.35;
    const r = 0.8 + hash01(id, 80 + i) * 0.3;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

function drawRock(ctx: Ctx, rock: DeepReadonly<RockState>): void {
  const radius = ROCK_RADIUS[rock.size];
  const outline = rockOutline(rock.id);
  const full = ROCK_HEALTH[rock.size];
  const damage = full > 1 ? (full - Math.max(1, rock.health)) / (full - 1) : 0;
  wrapped(rock.x, rock.y, radius * 1.15, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rock.spin);
    ctx.beginPath();
    outline.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * radius, p.y * radius);
      else ctx.lineTo(p.x * radius, p.y * radius);
    });
    ctx.closePath();
    if (rock.flash > 0) {
      ctx.fillStyle = "#fffaf0";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const shade = ctx.createRadialGradient(
        -radius * 0.3,
        -radius * 0.35,
        radius * 0.1,
        0,
        0,
        radius * 1.1,
      );
      shade.addColorStop(
        0,
        damage > 0 ? mix("#5a4c40", "#4a2b22", damage) : "#5c554c",
      );
      shade.addColorStop(
        1,
        damage > 0 ? mix(COLOR.rockFill, "#24120e", damage) : COLOR.rockFill,
      );
      ctx.fillStyle = shade;
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      damage > 0 ? mix(COLOR.rockEdge, COLOR.rockHurt, damage) : COLOR.rockEdge;
    ctx.stroke();

    // Craters for texture.
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    for (let i = 0; i < 3; i++) {
      const a = hash01(rock.id, 120 + i) * Math.PI * 2;
      const d = hash01(rock.id, 130 + i) * radius * 0.45;
      ctx.beginPath();
      ctx.arc(
        Math.cos(a) * d,
        Math.sin(a) * d,
        radius * (0.1 + hash01(rock.id, 140 + i) * 0.1),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Cracks: more of them, and hotter, as health falls.
    if (damage > 0 && rock.flash <= 0) {
      const cracks = Math.round(2 + damage * 4);
      ctx.strokeStyle = mix("#ffb070", "#ff4a1c", damage);
      ctx.lineWidth = 1.2 + damage * 1.4;
      ctx.shadowColor = COLOR.rockHurt;
      ctx.shadowBlur = 6 + damage * 8;
      for (let i = 0; i < cracks; i++) {
        const a = hash01(rock.id, 200 + i) * Math.PI * 2;
        const a2 = a + (hash01(rock.id, 220 + i) - 0.5) * 0.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * radius * 0.12, Math.sin(a) * radius * 0.12);
        ctx.lineTo(Math.cos(a2) * radius * 0.5, Math.sin(a2) * radius * 0.5);
        ctx.lineTo(Math.cos(a) * radius * 0.85, Math.sin(a) * radius * 0.85);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  });
}

function drawShip(ctx: Ctx, s: View): void {
  const ship = s.ship;
  const grace = ship.invuln > 0;
  // Through the grace the ship blinks and wears a shield ring.
  const blinkOn = !grace || Math.floor(s.simTime * 10) % 2 === 0;
  wrapped(ship.x, ship.y, 32, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    if (grace) {
      const fade = Math.min(1, ship.invuln / INVULN_TIME + 0.3);
      ctx.strokeStyle = `rgba(126, 249, 255, ${0.55 * fade})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -s.simTime * 30;
      ctx.beginPath();
      ctx.arc(0, 0, SHIP_R + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.rotate(ship.angle);
    if (ship.thrusting) {
      const flick =
        0.75 +
        0.25 * Math.sin(s.simTime * 90) +
        hash01(Math.floor(s.simTime * 60), 9) * 0.3;
      ctx.fillStyle = COLOR.flame;
      ctx.shadowColor = COLOR.flame;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(-12, -7);
      ctx.lineTo(-12 - 20 * flick, 0);
      ctx.lineTo(-12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLOR.flameCore;
      ctx.beginPath();
      ctx.moveTo(-12, -3.5);
      ctx.lineTo(-12 - 10 * flick, 0);
      ctx.lineTo(-12, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = blinkOn ? 1 : 0.28;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-14, -13);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, 13);
    ctx.closePath();
    ctx.fillStyle = COLOR.shipFill;
    ctx.fill();
    ctx.strokeStyle = COLOR.ship;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.shadowColor = COLOR.ship;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // The cockpit marks the nose end.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawSaucer(
  ctx: Ctx,
  saucer: DeepReadonly<SaucerState>,
  time: number,
): void {
  wrapped(saucer.x, saucer.y, SAUCER_R + 10, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = COLOR.saucer;
    ctx.shadowBlur = 14;
    // The dome.
    ctx.fillStyle = "rgba(190, 255, 120, 0.35)";
    ctx.strokeStyle = COLOR.saucer;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -5, 9, 8, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    // The hull.
    ctx.fillStyle = COLOR.saucerDark;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 1, SAUCER_R + 4, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Running lights chase around the rim.
    for (let i = 0; i < 5; i++) {
      const on = Math.floor(time * 8 + i) % 5 === 0;
      ctx.fillStyle = on ? "#ffffff" : "#7fbf3a";
      ctx.beginPath();
      ctx.arc(-14 + i * 7, 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

/**
 * The bullet's recent path, recovered by running its motion backwards: the
 * tick integrator is exactly reversible, so stepping back `TRAIL_TICKS` ticks
 * retraces where the well carried it. The points are unwrapped, relative to the
 * bullet, so a trail crossing a seam follows the bullet to the opposite edge.
 */
function trailOf(
  b: DeepReadonly<BulletState>,
  ticks: number,
): { x: number; y: number }[] {
  const pts = [{ x: b.x, y: b.y }];
  let x = b.x;
  let y = b.y;
  let vx = b.vx;
  let vy = b.vy;
  for (let i = 0; i < ticks; i++) {
    x -= vx * TICK_DT;
    y -= vy * TICK_DT;
    const g = gravityAt(
      ((x % FIELD_W) + FIELD_W) % FIELD_W,
      ((y % FIELD_H) + FIELD_H) % FIELD_H,
    );
    vx -= g.ax * TICK_DT;
    vy -= g.ay * TICK_DT;
    pts.push({ x, y });
  }
  return pts;
}

function drawBullet(
  ctx: Ctx,
  b: DeepReadonly<BulletState>,
  lifespan: number,
  core: string,
  trail: string,
): void {
  const age = lifespan - b.life;
  const ticks = Math.max(0, Math.min(TRAIL_TICKS, Math.round(age / TICK_DT)));
  const pts = trailOf(b, ticks);
  const reach = Math.hypot(b.vx, b.vy) * TICK_DT * ticks + 8;
  wrapped(b.x, b.y, reach, (x, y) => {
    const ox = x - b.x;
    const oy = y - b.y;
    if (pts.length > 1) {
      // One tapered ribbon, widest at the bullet and narrowing to nothing.
      const left: { x: number; y: number }[] = [];
      const right: { x: number; y: number }[] = [];
      const last = pts.length - 1;
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(last, i + 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const half = 2.6 * (1 - i / last);
        const nx = (-(b.y - a.y) / len) * half;
        const ny = ((b.x - a.x) / len) * half;
        left.push({ x: p.x + ox + nx, y: p.y + oy + ny });
        right.push({ x: p.x + ox - nx, y: p.y + oy - ny });
      });
      const fade = ctx.createLinearGradient(
        pts[0].x + ox,
        pts[0].y + oy,
        pts[last].x + ox,
        pts[last].y + oy,
      );
      fade.addColorStop(0, `rgba(${trail}, 0.9)`);
      fade.addColorStop(0.5, `rgba(${trail}, 0.35)`);
      fade.addColorStop(1, `rgba(${trail}, 0)`);
      ctx.fillStyle = fade;
      ctx.beginPath();
      left.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      for (let i = right.length - 1; i >= 0; i--)
        ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = core;
    ctx.shadowColor = core;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function drawTorpedo(
  ctx: Ctx,
  t: DeepReadonly<TorpedoState>,
  time: number,
): void {
  wrapped(t.x, t.y, 52, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.heading);
    // The exhaust plume.
    const plume = ctx.createLinearGradient(-48, 0, -14, 0);
    plume.addColorStop(0, "rgba(255, 90, 20, 0)");
    plume.addColorStop(1, "rgba(255, 170, 60, 0.9)");
    ctx.fillStyle = plume;
    const wob = 1 + 0.2 * Math.sin(time * 70);
    ctx.beginPath();
    ctx.moveTo(-14, -6 * wob);
    ctx.lineTo(-48, 0);
    ctx.lineTo(-14, 6 * wob);
    ctx.closePath();
    ctx.fill();
    // The body: a heavy glowing slug, unlike any round.
    ctx.shadowColor = COLOR.torpedo;
    ctx.shadowBlur = 20;
    ctx.fillStyle = COLOR.torpedo;
    ctx.beginPath();
    ctx.moveTo(TORPEDO_R + 10, 0);
    ctx.lineTo(TORPEDO_R + 2, -TORPEDO_R);
    ctx.lineTo(-12, -TORPEDO_R);
    ctx.lineTo(-16, -TORPEDO_R - 4);
    ctx.lineTo(-16, TORPEDO_R + 4);
    ctx.lineTo(-12, TORPEDO_R);
    ctx.lineTo(TORPEDO_R + 2, TORPEDO_R);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff3d6";
    ctx.beginPath();
    ctx.arc(3, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (t.homing) {
      // A seeker ring pulses around the warhead.
      ctx.strokeStyle = `rgba(255, 140, 50, ${0.35 + 0.25 * Math.sin(time * 14)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, TORPEDO_R + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawEffect(ctx: Ctx, e: DeepReadonly<EffectState>): void {
  const total = e.kind === "ship" ? 1.1 : e.kind === "saucer" ? 0.8 : 0.55;
  const p = 1 - e.t / total;
  const color =
    e.kind === "ship"
      ? "126, 249, 255"
      : e.kind === "saucer"
        ? "182, 255, 92"
        : "230, 210, 180";
  const count = e.kind === "rock" ? 10 : 16;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const a = hash01(e.seed, 300 + i) * Math.PI * 2;
    const speed = 0.6 + hash01(e.seed, 340 + i) * 0.9;
    const d = e.r * 0.4 + p * (40 + e.r) * speed * 1.4;
    const x = e.x + Math.cos(a) * d;
    const y = e.y + Math.sin(a) * d;
    ctx.strokeStyle = `rgba(${color}, ${(1 - p).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${color}, ${(0.5 * (1 - p)).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r * 0.6 + p * (e.r + 30), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** The star, then every body on the field. */
function drawField(ctx: Ctx, s: View): void {
  drawBackdrop(ctx, s.simTime);
  drawStar(ctx, s.simTime);
  for (const r of s.rocks) drawRock(ctx, r);
  for (const e of s.effects) drawEffect(ctx, e);
  for (const b of s.enemyBullets)
    drawBullet(ctx, b, SAUCER_BULLET_LIFE, COLOR.enemyBullet, COLOR.enemyTrail);
  for (const b of s.bullets)
    drawBullet(ctx, b, BULLET_LIFE, COLOR.bullet, COLOR.bulletTrail);
  for (const t of s.torpedoes) drawTorpedo(ctx, t, s.simTime);
  if (s.saucer) drawSaucer(ctx, s.saucer, s.simTime);
  if (s.lives > 0) drawShip(ctx, s);
}

// ---- HUD and screens ----------------------------------------------------------

function shipGlyph(ctx: Ctx, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-8, -7);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 7);
  ctx.closePath();
  ctx.fillStyle = COLOR.shipFill;
  ctx.fill();
  ctx.strokeStyle = COLOR.ship;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx: Ctx, s: View): void {
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = COLOR.hud;
  ctx.font = `700 36px ${MONO}`;
  ctx.fillText(String(s.score).padStart(6, "0"), 26, 20);
  ctx.shadowBlur = 0;

  // Ships in reserve: every ship left but the one being flown.
  for (let i = 0; i < Math.max(0, s.lives - 1); i++)
    shipGlyph(ctx, 38 + i * 26, 78);

  // The torpedo: a glyph, lit when ready, and its charge bar beneath.
  const ready = s.torpedoCharge >= 1;
  const charge = Math.max(0, Math.min(1, s.torpedoCharge));
  ctx.save();
  ctx.translate(40, 108);
  ctx.globalAlpha = ready ? 1 : 0.35;
  ctx.fillStyle = COLOR.torpedo;
  if (ready) {
    ctx.shadowColor = COLOR.torpedo;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(6, -4);
  ctx.lineTo(13, 0);
  ctx.lineTo(6, 4);
  ctx.lineTo(-12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = ready ? COLOR.accent : COLOR.hudDim;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(ready ? "TORPEDO READY" : "TORPEDO", 62, 101);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(26, 122, 140, 6);
  ctx.fillStyle = ready ? COLOR.torpedo : "#a5592a";
  ctx.fillRect(26, 122, 140 * charge, 6);

  // The wave, top right.
  ctx.textAlign = "right";
  ctx.fillStyle = COLOR.hudDim;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText(`WAVE ${s.wave}`, FIELD_W - 26, 24);

  if (s.extraLifeTimer > 0) {
    const pulse = 0.7 + 0.3 * Math.sin(s.extraLifeTimer * 18);
    ctx.textAlign = "center";
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = `rgba(126, 249, 255, ${pulse.toFixed(3)})`;
    ctx.shadowColor = COLOR.ship;
    ctx.shadowBlur = 16;
    ctx.fillText("+1 SHIP", FIELD_W / 2, 64);
    ctx.shadowBlur = 0;
  }
}

function drawBanner(ctx: Ctx, s: View): void {
  if (s.waveBanner <= 0) return;
  const fadeIn = Math.min(1, (1.5 - s.waveBanner) * 6 + 0.2);
  const fadeOut = Math.min(1, s.waveBanner * 4);
  ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(5, 7, 15, 0.55)";
  ctx.fillRect(0, STAR_Y - 46, FIELD_W, 92);
  ctx.font = `800 64px ${FONT}`;
  ctx.fillStyle = COLOR.accent;
  ctx.shadowColor = "#ff8a3c";
  ctx.shadowBlur = 24;
  ctx.fillText(`WAVE ${s.wave}`, FIELD_W / 2, STAR_Y);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawMenu(ctx: Ctx, s: View): void {
  const items = menuItems(s.screen);
  if (items === null) return;
  items.forEach((label, i) => {
    const r = menuRect(s.screen, i);
    if (r === null) return;
    const on = i === s.menuIndex;
    ctx.fillStyle = on ? "rgba(255, 207, 90, 0.16)" : "rgba(10, 16, 32, 0.72)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = on ? 2.5 : 1;
    ctx.strokeStyle = on ? COLOR.accent : "rgba(160, 180, 220, 0.35)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${on ? 800 : 600} 24px ${FONT}`;
    ctx.fillStyle = on ? COLOR.accent : COLOR.hud;
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    if (on) {
      ctx.fillText("▶", r.x + 30, r.y + r.h / 2 + 1);
      ctx.fillText("◀", r.x + r.w - 30, r.y + r.h / 2 + 1);
    }
  });
}

function dimField(ctx: Ctx, alpha: number): void {
  ctx.fillStyle = `rgba(3, 4, 10, ${alpha})`;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function title(
  ctx: Ctx,
  text: string,
  y: number,
  size: number,
  color: string,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillText(text, FIELD_W / 2, y);
  ctx.shadowBlur = 0;
}

/** A few dimmed rocks circling the star behind the title, drawn from time alone. */
function drawTitleRocks(ctx: Ctx, time: number): void {
  const sizes: readonly RockSize[] = [
    "large",
    "medium",
    "small",
    "medium",
    "large",
    "small",
  ];
  ctx.globalAlpha = 0.4;
  sizes.forEach((size, i) => {
    const orbit = 220 + i * 55;
    const a = time * (0.12 - i * 0.012) + i * 1.9;
    drawRock(ctx, {
      id: 900 + i,
      x: STAR_X + Math.cos(a) * orbit * 1.35,
      y: STAR_Y + Math.sin(a) * orbit * 0.6,
      vx: 0,
      vy: 0,
      size,
      spin: time * (0.3 + i * 0.07),
      health: ROCK_HEALTH[size],
      flash: 0,
    });
  });
  ctx.globalAlpha = 1;
}

function drawTitle(ctx: Ctx, s: View): void {
  drawBackdrop(ctx, s.simTime);
  drawStar(ctx, s.simTime);
  drawTitleRocks(ctx, s.simTime);
  dimField(ctx, 0.35);
  title(ctx, TITLE_TEXT, 210, 128, "#ffd27a");
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = COLOR.hud;
  ctx.textAlign = "center";
  ctx.fillText(TAGLINE_TEXT, FIELD_W / 2, 300);
  drawMenu(ctx, s);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = COLOR.hudDim;
  ctx.fillText(
    "ARROWS / WASD to choose  ·  ENTER or SPACE to confirm  ·  M sound",
    FIELD_W / 2,
    650,
  );
}

const HOWTO_LINES: readonly string[] = [
  "Shoot every rock down to dust. Big rocks break into two smaller ones, and those",
  "break again — clear the last fragment and the next, faster wave rolls in.",
  "The star at the centre pulls your bullets and the rocks, but never your ship.",
  "Bend your shots around it to hit rocks hiding on the far side.",
  "Anything the star swallows comes back in from the edge of the field.",
  "Larger rocks are armored: they take several hits, cracking as they weaken.",
  "Your torpedo is a single guided shot that recharges over ten seconds. It locks",
  "onto the nearest thing in a narrow cone ahead, flies straight through the pull,",
  "and smashes any rock in one hit. A hunting saucer drops in now and then — shoot it down.",
];

const HOWTO_KEYS: readonly (readonly [string, string])[] = [
  ["ARROWS or WASD", "Turn left and right, thrust with up"],
  ["SPACE", "Fire the gun (hold to keep firing)"],
  ["F", "Launch the torpedo"],
  ["P or ESC", "Pause and resume"],
  ["M", "Sound on and off"],
  ["ENTER", "Choose on a menu — ESC goes back"],
];

function drawHowto(ctx: Ctx, s: View): void {
  drawBackdrop(ctx, s.simTime);
  drawStar(ctx, s.simTime);
  dimField(ctx, 0.72);
  title(ctx, "HOW TO PLAY", 70, 48, "#ffd27a");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 19px ${FONT}`;
  ctx.fillStyle = COLOR.hud;
  HOWTO_LINES.forEach((line, i) =>
    ctx.fillText(line, FIELD_W / 2, 130 + i * 30),
  );
  HOWTO_KEYS.forEach(([keys, does], i) => {
    const y = 438 + i * 34;
    ctx.textAlign = "right";
    ctx.font = `700 19px ${MONO}`;
    ctx.fillStyle = COLOR.accent;
    ctx.fillText(keys, 600, y);
    ctx.textAlign = "left";
    ctx.font = `500 19px ${FONT}`;
    ctx.fillStyle = COLOR.hud;
    ctx.fillText(does, 630, y);
  });
  ctx.textAlign = "center";
  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = COLOR.hudDim;
  ctx.fillText("Press ENTER or ESC to return", FIELD_W / 2, 680);
}

function drawPaused(ctx: Ctx, s: View): void {
  drawField(ctx, s);
  drawHud(ctx, s);
  dimField(ctx, 0.6);
  title(ctx, "PAUSED", 200, 72, COLOR.hud);
  drawMenu(ctx, s);
}

function drawGameOver(ctx: Ctx, s: View): void {
  drawField(ctx, s);
  dimField(ctx, 0.66);
  title(ctx, "GAME OVER", 190, 86, "#ff6a5a");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 34px ${MONO}`;
  ctx.fillStyle = COLOR.hud;
  ctx.fillText(`SCORE ${s.score}`, FIELD_W / 2, 300);
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = COLOR.hudDim;
  ctx.fillText(`REACHED WAVE ${s.wave}`, FIELD_W / 2, 350);
  drawMenu(ctx, s);
}

/** Draw the screen the state is on. */
export function drawGame(ctx: Ctx, s: View): void {
  ctx.save();
  switch (s.screen) {
    case "title":
      drawTitle(ctx, s);
      break;
    case "howto":
      drawHowto(ctx, s);
      break;
    case "playing":
      drawField(ctx, s);
      drawBanner(ctx, s);
      drawHud(ctx, s);
      break;
    case "paused":
      drawPaused(ctx, s);
      break;
    case "gameover":
      drawGameOver(ctx, s);
      break;
  }
  ctx.restore();
}

/** Blend two `#rrggbb` colors. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * t);
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
