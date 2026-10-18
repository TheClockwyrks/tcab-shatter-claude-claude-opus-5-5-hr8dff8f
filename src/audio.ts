// Shatter — the six cues (specs/audio.md), each a distinct synthesized sound.

import type { CueSpec } from "@clockwyrks/simple-2d";
import { CUES, type CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.fire]: {
    wave: "square",
    freq: 990,
    freqTo: 420,
    gain: 0.08,
    durationMs: 70,
  },
  [CUES.shatter]: {
    wave: "sawtooth",
    freq: 220,
    freqTo: 45,
    gain: 0.18,
    durationMs: 260,
  },
  // Held for as long as thrust is applied: a low rumble.
  [CUES.thrust]: { wave: "sawtooth", freq: 58, gain: 0.07, durationMs: 120 },
  [CUES.saucer]: {
    wave: "triangle",
    freq: 480,
    freqTo: 960,
    gain: 0.16,
    durationMs: 420,
  },
  [CUES.death]: {
    wave: "sawtooth",
    freq: 360,
    freqTo: 30,
    gain: 0.24,
    durationMs: 750,
  },
  [CUES.extraLife]: {
    wave: "sine",
    freq: 660,
    freqTo: 1320,
    gain: 0.2,
    durationMs: 480,
  },
};
