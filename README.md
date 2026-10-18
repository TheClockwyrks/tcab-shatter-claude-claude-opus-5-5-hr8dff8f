# Shatter

Shatter is a gravity-well rock shooter that runs entirely in the browser. You
fly a small ship on pure momentum across one wrapping field of deep space, with
a star fixed at the centre. The star pulls on every bullet and every rock but
never on your ship, so shots curve as they pass it and rocks swing around it on
looping paths. Big rocks are armored and take several hits before they split
into smaller ones. For the ones that won't break in time you carry a homing
torpedo on a ten-second recharge that destroys any rock in one hit. Clear the
field and a faster wave arrives, and a saucer drops in now and then to hunt you.

The game is built on the Simple 2D engine (vendored under `.vendor/`, with its
documentation in `engine/`). The full design specification is in `specs/`.

## Install

Requires Node.js 20 or newer.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173/>).

## Production build

```sh
npm run build
```

This type-checks and writes a self-contained static site to `dist/`, with
`index.html` at its root. It uses relative asset URLs, so you can serve `dist/`
as-is from any static host at any base path. `npm run preview` serves the build
locally.

## Controls

| Key                     | While playing            | On a menu              |
| ----------------------- | ------------------------ | ---------------------- |
| `ArrowLeft` / `A`       | Rotate counter-clockwise |                        |
| `ArrowRight` / `D`      | Rotate clockwise         |                        |
| `ArrowUp` / `W`         | Thrust                   | Move the highlight up  |
| `ArrowDown` / `S`       |                          | Move the highlight down |
| `Space`                 | Fire (hold to repeat)    | Confirm                |
| `F`                     | Launch the torpedo       |                        |
| `Enter`                 |                          | Confirm                |
| `Escape`                | Pause                    | Back / resume          |
| `P`                     | Pause                    | Resume (when paused)   |
| `M`                     | Toggle sound             | Toggle sound           |
| `` ` `` (backtick)      | Toggle the debug overlay | Toggle the debug overlay |

Menus also take a mouse or touch: point at or touch an entry to highlight it,
then click or tap it to choose it. On a touchscreen the engine shows on-screen
controls for flying.

## Development

| Command             | Does                                         |
| ------------------- | -------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm run lint`      | ESLint                                       |
| `npm run format`    | Prettier, in check mode                      |
| `npm test`          | The Vitest suite under `src/`, with coverage |

Source layout:

- `src/game.ts` holds the state types, the debug surface type, and the three
  engine functions.
- `src/sim.ts` is the fixed-timestep simulation (render-free).
- `src/world.ts` holds the state factories, wave spawning, and recycling.
- `src/menu.ts` handles menus and pointer input.
- `src/debug.ts` is the debug and automation surface.
- `src/render.ts` does all the drawing.
- `src/audio.ts` defines the cues, and `src/diagnostics.ts` the overlay values.
- `src/testing/harness.ts` runs the real engine headlessly for the tests.

The store-page showcase is in `showcase/`. `node tools/capture/run.mjs`
re-captures its media: it flies real games with a key-pressing autopilot and
records them with the engine's recorder.
