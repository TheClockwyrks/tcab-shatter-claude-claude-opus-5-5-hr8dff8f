// Shatter — the vertical menus: which entries each screen shows, where each
// entry's hit region lies, and how keys, a mouse, and touch contacts move the
// highlight and confirm an entry (specs/ui.md, specs/controls.md).

import type { PointerSample } from "@clockwyrks/simple-2d";
import { GAMEOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import type { Screen } from "./game";
import type { MenuRect } from "./types";

export const MENU_W = 380;
export const MENU_H = 54;
export const MENU_GAP = 14;

/** The entries the screen shows, or `null` on a screen with no menu. */
export function menuItems(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "gameover":
      return GAMEOVER_ITEMS;
    default:
      return null;
  }
}

/** Where the first entry's region begins on each menu screen. */
function menuTop(screen: Screen): number {
  switch (screen) {
    case "title":
      return 430;
    case "paused":
      return 300;
    default:
      return 440;
  }
}

/** The hit region of entry `index` on `screen`'s menu, or `null` for none. */
export function menuRect(screen: Screen, index: number): MenuRect | null {
  const items = menuItems(screen);
  if (items === null || !Number.isInteger(index)) return null;
  if (index < 0 || index >= items.length) return null;
  return {
    x: 640 - MENU_W / 2,
    y: menuTop(screen) + index * (MENU_H + MENU_GAP),
    w: MENU_W,
    h: MENU_H,
  };
}

/** The entry whose region holds `(x, y)`, or `-1`. */
export function menuHit(screen: Screen, x: number, y: number): number {
  const items = menuItems(screen);
  if (items === null) return -1;
  for (let i = 0; i < items.length; i++) {
    const r = menuRect(screen, i);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/** Move the highlight by `step`, wrapping at both ends. */
export function moveHighlight(
  index: number,
  step: number,
  count: number,
): number {
  const base = Number.isFinite(index) ? Math.trunc(index) : 0;
  return (((base + step) % count) + count) % count;
}

export interface PointerPress {
  readonly id: number;
  readonly item: number;
}

export interface PointerOutcome {
  readonly highlight: number | null;
  readonly confirm: number | null;
  readonly presses: PointerPress[];
}

/**
 * Apply one frame's pointer and touch samples to `screen`'s menu. A sample that
 * lands on or travels onto an entry highlights it; a press and its release, or
 * a landing and its lift, inside one entry's region confirm that entry.
 */
export function applyPointer(
  screen: Screen,
  samples: readonly PointerSample[],
  pressed: readonly PointerPress[],
): PointerOutcome {
  let highlight: number | null = null;
  let confirm: number | null = null;
  const presses = pressed.map((p) => ({ ...p }));
  for (const s of samples) {
    if (s.button !== null && s.button !== "primary") continue;
    const item = menuHit(screen, s.x, s.y);
    if (s.type === "down") {
      if (item >= 0) highlight = item;
      const at = presses.findIndex((p) => p.id === s.id);
      if (at >= 0) presses.splice(at, 1);
      presses.push({ id: s.id, item });
    } else if (s.type === "move") {
      if (item >= 0) highlight = item;
    } else {
      const at = presses.findIndex((p) => p.id === s.id);
      if (at >= 0) {
        const press = presses[at];
        presses.splice(at, 1);
        if (item >= 0 && press.item === item) {
          highlight = item;
          confirm = item;
        }
      }
    }
  }
  return { highlight, confirm, presses };
}
