// Sound design v2: every SoundId as a layered recipe rendered offline (pure DSP in ./audio/dsp.ts) into mono
// buffers. Each sound has a body (tonal/modal layer + noise texture with filter envelopes) and a tail (shared soft
// room reverb, sometimes a dark echo), then is mastered to a common loudness. Gem colours have their own timbres.
//
// Design palette: "bright jewel tones on warm earth". Gentle highs (fundamentals mostly below 2.5 kHz, partials
// soft and fast-decaying), warm lows (sub thumps saturated a little so phone speakers still hear them).
// v3 (owner playtest 2026-11-23): gem clears are sharp glass clinks (no bells); drill, earthquake and the
// lightning zaps were rebuilt as motor/grind, stomp/rumble and electric-arc crackle.

import { Rng, Track, arc, env, filt, fm, master, osc, saturate, sweep } from './audio/dsp';

export const SOUND_IDS = [
  'tap_invalid', 'clear', 'dirt_crack', 'dirt_break', 'crust_chip', 'relic_reveal', 'boon', 'geode',
  'power_charge', 'power_merge', 'power_arm', 'power_disarm', 'fire', 'wave', 'quake', 'lightning', 'zap', 'drill',
  'bedrock_shatter', 'shuffle', 'win', 'lose', 'star', 'perk_pick', 'reforge_token',
  'ui_click', 'ui_open', 'ui_close', 'level_start',
] as const;

/** v1 ids still accepted by `play` so older call sites keep working; they map to v2 sounds. */
export const LEGACY_SOUND_ALIASES = { stamp_earn: 'power_charge', stamp_place: 'power_arm' } as const;
export type LegacySoundId = keyof typeof LEGACY_SOUND_ALIASES;
export type SoundId = (typeof SOUND_IDS)[number] | LegacySoundId;

/** Gem colour order (matches `GEM_NAMES` in src/core/types.ts). */
export const GEM_SOUND_NAMES = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst'] as const;
/** Trigger sound of each colour's power (Wildfire, Tidal Wave, Earthshaker, Chain Lightning, Drill). */
export const POWER_SOUND_FOR_COLOR = ['fire', 'wave', 'quake', 'lightning', 'drill'] as const;

/**
 * Options for `AudioService.play`. Which ids read which option:
 * - all: `volume` (0..1, default 1).
 * - `clear`: `color` (0..4), `size` (group size: sets the pitch via `clearPitchForGroupSize` and adds a shimmer at
 *   9+ and a chord at 15+), `pitch` (semitones; overrides the size-derived pitch).
 * - `power_charge`: `color`, `level` (1..5: higher = higher pitch, fuller layer from level 3).
 * - `power_merge`: `level` (the new level, 2..5).
 * - `fire` `wave` `quake` `lightning` `drill`: `level` (1..5: louder, plus an impact layer from level 3).
 * - `zap`: `index` (strike number 0,1,2...: climbs a pentatonic pattern).
 * - `star`: `index` (0, 1, 2: rising pitch per star).
 * - any other id: `pitch` (semitones) is honoured as a plain transpose.
 */
export interface PlayOptions {
  pitch?: number;
  volume?: number;
  color?: number;
  level?: number;
  index?: number;
  size?: number;
}

/** Major pentatonic steps (semitones). */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19] as const;

/**
 * Semitone offset for the `clear` sound by group size: 2 -> 0, 3 -> 2, 4 -> 4, 5 -> 7, 6 -> 9, 7 -> 12,
 * then every two extra blocks climb one more pentatonic step, capped at +19 (12+ blocks).
 */
export function clearPitchForGroupSize(size: number): number {
  const n = Number.isFinite(size) ? Math.floor(size) : 2;
  const idx = n <= 7 ? Math.max(0, n - 2) : Math.min(PENTATONIC.length - 1, 5 + Math.ceil((n - 7) / 2));
  return PENTATONIC[idx] ?? 0;
}

/** Clear sounds are rendered at these pitch steps per colour and transposed (by at most 3 semitones) from the nearest. */
export const CLEAR_ANCHORS = [2, 9, 16] as const;

// ---- notes and voices ------------------------------------------------------------------------------------------

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const TAU = Math.PI * 2;
/** Base pitch per gem colour at clear step 0 (all in G major pentatonic): topaz sits an octave up, like a celesta. */
const GEM_BASE = [67, 67, 67, 79, 67].map(hz);

/** One note in a gem colour's own timbre. */
function gem(t: Track, color: number, at: number, f: number, a: number): void {
  switch (color) {
    case 1: { // sapphire: glassy FM bell (inharmonic 3.5 ratio), plus a slightly detuned partial that beats softly
      const b = env(fm(t.sr, 1.5, f, 3.5, 1.5, 0.1, 0.12), t.sr, 0.0015, 0.5, 0.1);
      t.mix(b, at, a * 0.75).modal(at, f * 1.003, a * 0.3, 0.8, 0.002).modal(at, f * 2.01, a * 0.15, 0.3);
      break;
    }
    case 2: // emerald: kalimba tine (metallic ~5.9x overtone, quick) over a wooden box knock
      t.modal(at, f, a, 0.48, 0.001).modal(at, f * 5.92, a * 0.14, 0.035, 0.0008).modal(at, f * 2.01, a * 0.07, 0.12)
        .modal(at, 196, a * 0.2, 0.045, 0.001)
        .burst(at, 0.06, { amp: a * 0.4, bp: 420, q: 2.5, attack: 0.0008, decay: 0.012 });
      break;
    case 3: { // topaz: celesta bar, pure with a soft octave (tapering at high pitch so it never gets piercing), felt hammer
      const soft = Math.min(1, 1200 / f);
      t.modal(at, f, a, 0.55, 0.0012).modal(at, f * 2, a * 0.2 * soft, 0.2).modal(at, f * 3, a * 0.05 * soft, 0.07)
        .modal(at, f * 4.1, a * 0.02 * soft, 0.03)
        .burst(at, 0.02, { amp: a * 0.12, lp: 3000, attack: 0.0006, decay: 0.004 });
      break;
    }
    case 4: // amethyst: soft mallet pad, chorused, slower attack, sub octave, low-passed
      t.tone(at, 1.2, f, { amp: a * 0.55, wave: 1, attack: 0.012, decay: 0.42, lp: 1700 })
        .tone(at, 1.2, f * 1.004, { amp: a * 0.38, attack: 0.02, decay: 0.55 })
        .tone(at, 1.2, f * 0.996, { amp: a * 0.38, attack: 0.02, decay: 0.55 })
        .tone(at, 0.9, f * 0.5, { amp: a * 0.2, attack: 0.015, decay: 0.3 })
        .burst(at, 0.05, { amp: a * 0.06, bp: 900, attack: 0.002, decay: 0.012 });
      break;
    default: // ruby: warm marimba (strong fundamental, tuned 4th partial, faint 10th), felt-mallet thock
      t.modal(at, f, a, 0.38, 0.0012).modal(at, f * 3.93, a * 0.24, 0.06, 0.001).modal(at, f * 9.1, a * 0.04, 0.018)
        .modal(at, f * 0.5, a * 0.12, 0.2, 0.003)
        .burst(at, 0.04, { amp: a * 0.22, lp: 1400, attack: 0.0008, decay: 0.008 });
  }
}

/** Clear pitch at step 0 (G5): glass sits higher than the old mallet voices. */
const GLASS_BASE = hz(79);

/**
 * Partial sets [ratio, amp, decay s] per gem colour: all struck glass, told apart by their overtones.
 * ruby: glass bar (free-free 2.76 / 5.40), sapphire: glass cup (2.32 / 4.25) with a slow beat, emerald: near-
 * harmonic crystal, topaz: bright and dry, amethyst: thicker cup with a wider beat.
 */
const GLASS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[1, 1, 0.15], [2.76, 0.42, 0.045], [5.4, 0.16, 0.016]],
  [[1, 1, 0.19], [1.0035, 0.35, 0.21], [2.32, 0.45, 0.06], [4.25, 0.2, 0.022]],
  [[1, 1, 0.12], [2.01, 0.32, 0.045], [3.02, 0.22, 0.022], [5.1, 0.08, 0.01]],
  [[1, 1, 0.12], [3.0, 0.36, 0.035], [6.2, 0.12, 0.012]],
  [[1, 0.9, 0.22], [1.006, 0.5, 0.24], [2.32, 0.36, 0.055], [4.25, 0.12, 0.02]],
];

/** One struck-glass note: hard, near-instant attack, a bright strike tick and quickly fading overtones. */
function glass(t: Track, color: number, at: number, f: number, a: number): void {
  for (const [r, amp, d] of GLASS[color] ?? GLASS[0]!) t.modal(at, f * r, a * amp, d, 0.0003, t.rng.range(0, TAU));
  t.burst(at, 0.006, { amp: a * 0.45, hp: 3500, attack: 0.0002, decay: 0.0012 });
}

/** Tiny glass shards tinkling after a break: short, high, quieter as they go. */
function shards(t: Track, at: number, dur: number, count: number, f: number, a: number): void {
  t.grains(at, dur, count, 1.6, (gt, u) => {
    const sf = f * t.rng.range(1.5, 3);
    t.modal(gt, sf, a * (1 - 0.6 * u) * t.rng.range(0.6, 1), t.rng.range(0.012, 0.03), 0.0003)
      .modal(gt, sf * 2.76, a * 0.25 * (1 - u), 0.008, 0.0003);
  });
}

/** Electric crackle: a dense train of very short high-passed clicks. */
function crackle(t: Track, at: number, dur: number, count: number, a: number, cluster = 1.5): void {
  t.grains(at, dur, count, cluster, (gt, u) => t.burst(gt, 0.003, {
    amp: a * t.rng.range(0.3, 1) * (1 - 0.7 * u), hp: t.rng.range(2200, 4500), attack: 0.0001, decay: 0.0006,
  }));
}

/** Arc buzz: a jittery saw driven hard and band-passed, like a short across two terminals. */
function buzz(t: Track, at: number, dur: number, f: number, a: number, decay: number, phase = 0): void {
  const b = osc(t.sr, dur, (u) => f * (1 + 0.09 * Math.sin(u * dur * TAU * 23 + phase) + 0.05 * Math.sin(u * dur * TAU * 61)), 2);
  saturate(b, 4);
  filt(b, t.sr, 'bp', 2300, 0.8);
  filt(b, t.sr, 'hp', 500);
  env(b, t.sr, 0.0005, decay, Math.min(0.03, dur / 3));
  t.mix(b, at, a);
}

/** Tiny glassy sparkle ping. */
function ping(t: Track, at: number, f: number, a: number, decay = 0.18): void {
  t.modal(at, f, a, decay, 0.001).modal(at, f * 2.0, a * 0.12, decay * 0.3, 0.001);
}

/** A sparkle cloud of pentatonic pings (midi notes picked at random from `notes`). */
function sparkle(t: Track, at: number, dur: number, count: number, notes: readonly number[], a: number): void {
  t.grains(at, dur, count, 1.3, (gt, u) => ping(t, gt, hz(t.rng.pick(notes)), a * (1 - 0.5 * u) * t.rng.range(0.6, 1)));
}

/** Soft pad chord (triangles through a gentle low-pass), `attack` swell, `decay` time constant. */
function pad(t: Track, at: number, dur: number, notes: readonly number[], a: number, attack: number, decay = Infinity, lp: number | ((u: number) => number) = 1800): void {
  for (const m of notes) {
    t.tone(at, dur, hz(m) * t.rng.range(0.998, 1.002), { amp: a, wave: 1, attack, decay, release: dur * 0.5, lp });
  }
}

/** Drill timing (see drillPace in src/game/timeline.ts): 0.13 s spin-up, boring until ~0.7 s, then break-through. */
const DRILL_BORE = 0.13, DRILL_END = 0.7;

/** Break-through: the bit punches out of the rock (thump, crumble, a few falling bits). */
function drillBreak(t: Track, at: number, a = 1): void {
  t.burst(at, 0.25, { amp: 0.5 * a, lp: sweep(2500, 400), attack: 0.001, decay: 0.05 })
    .tone(at, 0.35, sweep(120, 45), { amp: 0.7 * a, attack: 0.002, decay: 0.08 })
    .grains(at + 0.02, 0.35, 14, 1.5, (gt, u) => t.modal(gt, t.rng.range(300, 900), 0.12 * a * (1 - u), 0.015, 0.0005));
}

/** Rock auger: a noisy whirr (no buzzy oscillator) with a chunky crunch per row bored. */
function drillAuger(t: Track): void {
  const whirr = (u: number) => {
    const sec = u * 0.95;
    return sec < DRILL_BORE ? 500 * (1400 / 500) ** (sec / DRILL_BORE)
      : sec < DRILL_END ? 1400 + 120 * Math.sin(sec * TAU * 9) : 1400 * Math.exp(-(sec - DRILL_END) * 4);
  };
  t.burst(0, 0.95, { amp: 1.4, bp: whirr, q: 4, attack: 0.08, release: 0.2, shape: (u) => 0.75 + 0.25 * Math.sin(u * 0.95 * TAU * 34) })
    .tone(0, 0.9, (u) => (u * 0.9 < DRILL_BORE ? 90 + (u * 0.9 / DRILL_BORE) * 60 : 150 + 6 * Math.sin(u * 0.9 * TAU * 11)), { amp: 0.12, wave: 1, attack: 0.06, release: 0.2, lp: 500 });
  for (let i = 0; i < 8; i++) {
    const at = DRILL_BORE + 0.01 + i * 0.07, g = 0.8 + 0.2 * t.rng.next();
    t.burst(at, 0.06, { amp: 0.45 * g, lp: 1800, hp: 150, attack: 0.001, decay: 0.018 })
      .tone(at, 0.08, sweep(150, 80), { amp: 0.22 * g, attack: 0.001, decay: 0.02 })
      .grains(at, 0.04, 4, 1, (gt) => t.burst(gt, 0.006, { amp: 0.12, bp: t.rng.range(1800, 3500), q: 2, attack: 0.0002, decay: 0.0012 }));
  }
  drillBreak(t, DRILL_END + 0.02);
}

function knock(t: Track, at: number, f: number, a: number): void {
  t.tone(at, 0.12, sweep(f * 1.3, f, 0.3), { amp: a, attack: 0.0015, decay: 0.035, lp: 900 })
    .modal(at, f * 2.6, a * 0.2, 0.015, 0.001)
    .burst(at, 0.03, { amp: a * 0.25, lp: 700, attack: 0.001, decay: 0.008 });
}

// ---- recipes ---------------------------------------------------------------------------------------------------

/** Internal layers that are only played together with a public id. */
type InternalId = 'clear_shimmer' | 'clear_chord' | 'charge_full' | 'power_impact';
type RecipeId = (typeof SOUND_IDS)[number] | InternalId;

/** Identifies one pre-rendered buffer. */
export interface BufferKey {
  id: RecipeId;
  color: number;
  step: number;
  variant: number;
}

interface Recipe {
  /** Render length including the tail, seconds (trailing silence is trimmed). */
  dur: number;
  /** Loudness relative to `TARGET_DB`. */
  db?: number;
  variants?: number;
  /** Random transpose per play, +- semitones. */
  jitter?: number;
  /** Reverb send (wet RMS / dry RMS), room size, damping. */
  room?: number;
  size?: number;
  /** Saturation drive for warmth (0 = off). */
  warm?: number;
  draw(t: Track, k: BufferKey): void;
}

/** Target short-term (100 ms window) RMS loudness, dBFS. */
export const TARGET_DB = -17;

const R: Record<RecipeId, Recipe> = {
  tap_invalid: {
    dur: 0.4, db: -6, variants: 2, jitter: 0.4, room: 0.12,
    draw(t, k) {
      const f = k.variant ? 165 : 178;
      knock(t, 0, f, 1);
      knock(t, 0.09, f * 0.89, 0.55);
    },
  },

  clear: {
    dur: 0.7, db: -1, jitter: 0.08,
    draw(t, k) {
      const f = GLASS_BASE * 2 ** (k.step / 12);
      glass(t, k.color, 0, f, 1);
      // The gem cracks: a crisp shatter, a few shards, and a tiny low tick so small speakers feel the hit.
      t.burst(0, 0.04, { amp: 0.3, bp: sweep(6500, 3000), q: 0.9, attack: 0.0003, decay: 0.007 });
      shards(t, 0.012, 0.13, 5, f, 0.22);
      t.tone(0, 0.05, sweep(420, 230), { amp: 0.14, attack: 0.0005, decay: 0.01 });
      t.room(0.1, 0.6, 0.5);
    },
  },
  clear_shimmer: {
    dur: 0.9, db: -3, room: 0.2,
    draw(t) {
      // Rendered at clear step 16: a quick cascade of glass clinks around the clear note.
      [0, 4, 7, 12].forEach((m, i) => glass(t, 1, 0.025 + i * 0.04, hz(79 + 16 - 12 + m), 0.42 - i * 0.06));
      shards(t, 0.05, 0.3, 8, hz(79 + 16 - 12), 0.12);
      t.burst(0, 0.35, { amp: 0.03, bp: sweep(4000, 6000), q: 0.8, attack: 0.05, decay: 0.1 });
    },
  },
  clear_chord: {
    dur: 1.3, db: -2, room: 0.25,
    draw(t) {
      // Rendered at clear step 19: a big glass burst (thump, shatter, chord of clinks, a shower of shards).
      const root = 79 + 19 - 12;
      t.tone(0, 0.3, sweep(150, 60, 0.5), { amp: 0.6, attack: 0.002, decay: 0.07 })
        .burst(0, 0.25, { amp: 0.4, bp: sweep(5000, 2000), q: 0.7, attack: 0.0005, decay: 0.05 });
      [0, 7, 12].forEach((m, i) => glass(t, i === 1 ? 4 : 1, 0.02 + i * 0.035, hz(root + m), 0.5 - i * 0.08));
      shards(t, 0.04, 0.5, 16, hz(root), 0.14);
    },
  },

  dirt_crack: {
    dur: 0.45, db: -4, variants: 3, jitter: 0.45, room: 0.1, warm: 1.4,
    draw(t) {
      t.tone(0, 0.2, sweep(t.rng.range(110, 130), 62, 0.5), { amp: 0.9, attack: 0.002, decay: 0.05 })
        .burst(0, 0.2, { amp: 0.5, lp: sweep(1600, 350), attack: 0.002, decay: 0.05 })
        .grains(0.005, 0.14, 10, 1.6, (at, u) => t.burst(at, 0.02, {
          amp: 0.25 * (1 - u) * t.rng.range(0.5, 1), bp: t.rng.range(900, 2600), q: 2, attack: 0.0005, decay: 0.004,
        }));
    },
  },
  dirt_break: {
    dur: 0.85, db: -2, variants: 2, jitter: 0.45, room: 0.15, warm: 1.6,
    draw(t) {
      t.tone(0, 0.35, sweep(95, 48, 0.5), { amp: 1, attack: 0.002, decay: 0.09 })
        .tone(0, 0.2, sweep(190, 96, 0.5), { amp: 0.3, attack: 0.002, decay: 0.05 })
        .burst(0, 0.55, { amp: 0.55, lp: sweep(2000, 260), attack: 0.003, decay: 0.14 })
        .grains(0.01, 0.45, 26, 1.8, (at, u) => {
          const f = t.rng.range(350, 1100);
          t.modal(at, f, 0.12 * (1 - u * 0.7), 0.012, 0.0005)
            .burst(at, 0.02, { amp: 0.16 * (1 - u), bp: f * 2, q: 1.5, attack: 0.0005, decay: 0.004 });
        });
    },
  },
  crust_chip: {
    dur: 0.5, db: -5, variants: 3, jitter: 0.4, room: 0.2,
    draw(t, k) {
      const f = [1650, 1820, 1500][k.variant] ?? 1650;
      t.modal(0, f, 0.8, 0.09, 0.0008).modal(0, f * 2.71, 0.2, 0.03, 0.0006).modal(0, 320, 0.5, 0.025, 0.001)
        .burst(0, 0.03, { amp: 0.3, bp: 3000, q: 1.2, attack: 0.0004, decay: 0.005 })
        .grains(0.02, 0.15, 3, 1.5, (at) => t.modal(at, t.rng.range(900, 1600), 0.1, 0.015));
    },
  },

  relic_reveal: {
    dur: 2, db: 1, jitter: 0.05, room: 0.32, size: 0.84,
    draw(t) {
      // Warm boom, a pad that swells open, a rising celesta arpeggio crowned by a bell, then glitter.
      t.tone(0, 0.6, sweep(130, 65, 0.5), { amp: 0.35, attack: 0.004, decay: 0.15 });
      pad(t, 0, 1.7, [60, 67, 72, 76], 0.2, 0.35, Infinity, arc(500, 2400, 900, 0.45));
      t.tone(0, 1.6, hz(48), { amp: 0.22, attack: 0.3, release: 0.8 });
      [72, 74, 76, 79, 81, 84, 88].forEach((m, i) => gem(t, 3, 0.02 + i * 0.075, hz(m), 0.42 + i * 0.04));
      gem(t, 1, 0.5, hz(84), 0.45);
      sparkle(t, 0.55, 0.7, 10, [84, 88, 91, 96], 0.09);
      t.echo(0.16, 0.25, 0.16, 2500);
    },
  },
  boon: {
    dur: 1.4, jitter: 0.05, room: 0.3,
    draw(t) {
      [74, 79, 86].forEach((m, i) => gem(t, 1, i * 0.11, hz(m), 0.55 + i * 0.05));
      pad(t, 0, 1.1, [55, 62], 0.25, 0.08, 0.5, 1200);
      sparkle(t, 0.25, 0.5, 7, [86, 88, 91, 93], 0.1);
    },
  },
  geode: {
    dur: 1.3, room: 0.3,
    draw(t) {
      t.modal(0, hz(88), 0.5, 0.2, 0.001)
        .burst(0, 0.03, { amp: 0.25, bp: 2800, q: 1, attack: 0.0005, decay: 0.006 })
        .grains(0.01, 0.35, 16, 1.4, (at, u) => {
          const f = hz(t.rng.pick([84, 86, 88, 91, 93, 96]));
          t.modal(at, f, 0.22 * (1 - 0.5 * u), t.rng.range(0.12, 0.3), 0.001).modal(at, f * 2, 0.04, 0.05);
        })
        .burst(0, 0.6, { amp: 0.05, bp: sweep(2500, 4200), q: 0.7, attack: 0.05, decay: 0.2 })
        .tone(0, 0.6, hz(60), { amp: 0.2, attack: 0.01, decay: 0.25 });
    },
  },

  power_charge: {
    dur: 1.2, jitter: 0.1, room: 0.25,
    draw(t, k) {
      const f = GEM_BASE[k.color] ?? 392;
      t.burst(0, 0.42, { amp: 0.4, bp: sweep(350, 2200, 1.3), q: 1.4, attack: 0.3, release: 0.06 })
        .tone(0, 0.4, sweep(f * 0.5, f, 1.5), { amp: 0.22, wave: 1, attack: 0.3, release: 0.05, lp: 2000 });
      glass(t, k.color, 0.36, f * 2, 0.8);
      glass(t, k.color, 0.36, f * 3, 0.35);
    },
  },
  charge_full: {
    dur: 1.1, db: -2, room: 0.3, warm: 1.4,
    draw(t) {
      t.tone(0, 0.5, sweep(98, 196, 1.2), { amp: 0.5, wave: 1, attack: 0.3, release: 0.1, lp: 600 });
      [86, 91, 95, 98].forEach((m, i) => ping(t, 0.36 + i * 0.035, hz(m), 0.22, 0.25));
      t.tone(0.36, 0.6, hz(43), { amp: 0.3, attack: 0.01, decay: 0.2 });
    },
  },
  power_merge: {
    dur: 1.4, db: 0.5, jitter: 0.08, room: 0.3,
    draw(t) {
      t.burst(0, 0.38, { amp: 0.5, bp: sweep(300, 3000, 1.2), q: 1.1, attack: 0.28, release: 0.05 })
        .tone(0.3, 0.5, sweep(160, 70, 0.5), { amp: 0.5, attack: 0.004, decay: 0.12 });
      gem(t, 1, 0.32, hz(79), 0.5);
      gem(t, 3, 0.34, hz(83), 0.38);
      gem(t, 3, 0.36, hz(86), 0.42);
      gem(t, 1, 0.4, hz(91), 0.28);
      sparkle(t, 0.36, 0.5, 8, [91, 93, 95, 98], 0.08);
    },
  },
  power_arm: {
    dur: 0.6, db: -3, jitter: 0.15, room: 0.22,
    draw(t) {
      gem(t, 1, 0, hz(76), 0.45);
      gem(t, 1, 0.06, hz(83), 0.55);
      t.tone(0, 0.4, hz(59), { amp: 0.25, wave: 1, attack: 0.05, decay: 0.12, lp: 900 })
        .burst(0, 0.2, { amp: 0.12, bp: sweep(800, 2600), q: 1.5, attack: 0.08, decay: 0.06 });
    },
  },
  power_disarm: {
    dur: 0.55, db: -5, jitter: 0.15, room: 0.22,
    draw(t) {
      gem(t, 4, 0, hz(71), 0.5);
      gem(t, 4, 0.07, hz(64), 0.45);
      t.burst(0, 0.2, { amp: 0.08, bp: sweep(2000, 600), q: 1.5, attack: 0.03, decay: 0.06 });
    },
  },

  fire: {
    dur: 1.5, db: 0.5, jitter: 0.4, room: 0.2, warm: 1.5,
    draw(t) {
      t.burst(0, 1, { amp: 0.8, lp: arc(300, 2600, 700, 0.25), q: 0.9, attack: 0.12, decay: 0.35 })
        .burst(0, 1, { amp: 0.7, lp: 220, attack: 0.06, decay: 0.4 })
        .tone(0, 0.3, sweep(110, 55, 0.5), { amp: 0.5, attack: 0.006, decay: 0.08 })
        .grains(0.05, 1, 45, 1.3, (at, u) => t.burst(at, 0.012, {
          amp: t.rng.range(0.08, 0.28) * (1 - u * 0.6), bp: t.rng.range(1200, 3600), q: 1.8, attack: 0.0004, decay: 0.0025,
        }));
    },
  },
  wave: {
    dur: 1.7, jitter: 0.4, room: 0.3,
    draw(t) {
      t.burst(0, 1.2, { amp: 0.9, lp: arc(180, 1400, 350, 0.32), q: 1.1, attack: 0.32, decay: 0.35 })
        .burst(0.3, 0.6, { amp: 0.45, bp: sweep(2400, 900), q: 0.8, attack: 0.008, decay: 0.14 })
        .tone(0.28, 0.5, sweep(140, 60, 0.5), { amp: 0.35, attack: 0.01, decay: 0.12 })
        .grains(0.35, 0.9, 18, 1.5, (at, u) => {
          const f = t.rng.range(350, 900);
          t.tone(at, 0.05, sweep(f, f * 1.8), { amp: 0.1 * (1 - u * 0.5), attack: 0.004, decay: 0.015, release: 0.01 });
        });
    },
  },
  quake: {
    dur: 1.8, db: 0.5, jitter: 0.3, room: 0.15, warm: 2,
    draw(t) {
      // Wind-up, then the stomp lands (~0.13 s, matching the shock rings), rings thud outward, the ground rumbles.
      t.burst(0, 0.14, { amp: 0.3, lp: sweep(150, 700), attack: 0.11, release: 0.01 });
      const hit = 0.13;
      t.burst(hit, 0.012, { amp: 0.8, lp: 6000, hp: 200, attack: 0.0003, decay: 0.002 })
        .tone(hit, 0.6, sweep(95, 32, 0.6), { amp: 1, attack: 0.002, decay: 0.16 })
        .tone(hit, 0.25, sweep(190, 70, 0.5), { amp: 0.4, attack: 0.002, decay: 0.05 })
        .burst(hit, 0.2, { amp: 0.6, bp: sweep(1200, 300), q: 0.8, attack: 0.001, decay: 0.04 });
      for (let i = 1; i <= 5; i++) {
        const at = hit + i * 0.105, g = 0.75 ** i;
        t.tone(at, 0.25, sweep(85, 40), { amp: 0.5 * g, attack: 0.003, decay: 0.06 })
          .burst(at, 0.08, { amp: 0.3 * g, lp: 700, attack: 0.002, decay: 0.02 });
      }
      t.burst(hit, 1.4, { amp: 0.9, lp: sweep(260, 90), attack: 0.03, decay: 0.5, shape: (u) => 0.6 + 0.4 * Math.sin(u * 1.4 * TAU * 6.5) * Math.sin(u * 1.4 * TAU * 2.3) })
        .grains(hit, 0.9, 36, 1.3, (at, u) => {
          const f = t.rng.range(180, 700);
          t.modal(at, f, 0.22 * (1 - 0.6 * u), 0.02, 0.0006)
            .burst(at, 0.03, { amp: 0.18 * (1 - u), bp: f * 2.2, q: 1.2, attack: 0.0005, decay: 0.006 });
        })
        .grains(hit + 0.2, 0.9, 20, 1, (at, u) => t.burst(at, 0.01, { amp: 0.08 * (1 - u), bp: t.rng.range(2000, 4500), q: 2, attack: 0.0003, decay: 0.002 }));
    },
  },
  lightning: {
    dur: 1.6, jitter: 0.3, room: 0.2, warm: 1.4,
    draw(t) {
      // Strike crack and arc buzz with sparks, then thunder rolling away under the zaps.
      t.burst(0, 0.012, { amp: 1, hp: 1500, attack: 0.0002, decay: 0.003 });
      buzz(t, 0, 0.3, 72, 0.5, 0.09);
      crackle(t, 0, 0.25, 50, 0.5, 1.4);
      t.burst(0.05, 0.25, { amp: 0.6, bp: sweep(3000, 600), q: 0.6, attack: 0.002, decay: 0.06 })
        .burst(0.1, 1.3, { amp: 0.8, lp: sweep(500, 110), attack: 0.04, decay: 0.45, shape: (u) => 0.65 + 0.35 * Math.sin(u * 1.3 * TAU * 4.3) })
        .tone(0.08, 0.7, sweep(70, 40), { amp: 0.35, attack: 0.01, decay: 0.22 });
    },
  },
  zap: {
    dur: 0.4, db: -3, variants: 3, jitter: 0.5, room: 0.1, warm: 1.3,
    draw(t, k) {
      // One strike: a snap, a short arc buzz, spark crackle and a sizzle, plus a pitched snap so the chain climbs.
      const v = k.variant;
      t.burst(0, 0.008, { amp: 0.6, hp: 1800, lp: 7000, attack: 0.0002, decay: 0.0015 });
      buzz(t, 0, 0.16, [110, 128, 96][v] ?? 110, 0.9, 0.045, v);
      crackle(t, 0, 0.12, 26, 0.28, 1.7);
      t.burst(0.005, 0.2, { amp: 0.14, bp: sweep(4000, 1800), q: 0.7, attack: 0.002, decay: 0.05, shape: (u) => 0.5 + 0.5 * Math.abs(Math.sin(u * 0.2 * TAU * 90)) })
        .tone(0, 0.07, sweep(1500, 600), { amp: 0.35, wave: 3, attack: 0.0003, decay: 0.018 })
        .tone(0, 0.08, sweep(200, 90), { amp: 0.3, attack: 0.0005, decay: 0.02 });
    },
  },
  drill: {
    // Rock auger (owner's pick, 2026-11-23): noisy whirr, a crunch per row bored, break-through thump.
    dur: 1.3, jitter: 0.25, room: 0.12, warm: 1.2,
    draw(t) {
      drillAuger(t);
    },
  },
  power_impact: {
    dur: 1.1, room: 0.25, warm: 1.5,
    draw(t) {
      t.tone(0, 0.6, sweep(90, 40, 0.5), { amp: 1, attack: 0.004, decay: 0.18 })
        .burst(0, 0.5, { amp: 0.5, lp: sweep(900, 150), attack: 0.003, decay: 0.12 });
      sparkle(t, 0.05, 0.4, 6, [79, 84, 86, 91], 0.12);
    },
  },

  bedrock_shatter: {
    dur: 1.6, db: 1, jitter: 0.3, room: 0.22, warm: 1.6,
    draw(t) {
      t.burst(0, 0.06, { amp: 1, lp: 4500, hp: 150, attack: 0.0008, decay: 0.012 })
        .tone(0, 0.45, sweep(85, 42, 0.5), { amp: 1, attack: 0.002, decay: 0.12 })
        .tone(0, 0.3, sweep(170, 85, 0.5), { amp: 0.35, attack: 0.002, decay: 0.06 })
        .modal(0, 310, 0.3, 0.08).modal(0, 742, 0.18, 0.05)
        .grains(0.02, 1, 40, 1.9, (at, u) => {
          const f = t.rng.range(300, 1500);
          t.modal(at, f, 0.16 * (1 - u * 0.7), t.rng.range(0.008, 0.02), 0.0005)
            .burst(at, 0.025, { amp: 0.14 * (1 - u), bp: f * 1.7, q: 1.4, attack: 0.0005, decay: 0.005 });
        })
        .burst(0.02, 0.9, { amp: 0.45, lp: sweep(1800, 250), attack: 0.004, decay: 0.25 })
        .modal(0.09, 1750, 0.1, 0.08).modal(0.16, 1420, 0.08, 0.08);
    },
  },
  shuffle: {
    dur: 1.1, db: -3, jitter: 0.4, room: 0.25,
    draw(t) {
      t.burst(0, 0.65, { amp: 0.6, bp: arc(450, 1900, 650, 0.45), q: 0.9, attack: 0.2, decay: 0.25 })
        .grains(0.08, 0.5, 12, 1, (at) => t.modal(at, hz(t.rng.pick([79, 81, 83, 86, 88, 91])), 0.1, 0.03, 0.0008))
        .tone(0.05, 0.5, arc(200, 330, 220, 0.5), { amp: 0.15, wave: 1, attack: 0.15, release: 0.2, lp: 700 });
    },
  },

  win: {
    dur: 3, db: 1.5, room: 0.3,
    draw(t) {
      const melody: [number, number][] = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [81, 0.6], [84, 0.72], [86, 0.84], [88, 1.08]];
      for (const [m, at] of melody) gem(t, 0, at, hz(m), 0.55);
      gem(t, 3, 1.08, hz(88 + 12), 0.12);
      for (const [m, at] of [[48, 0], [53, 0.6], [55, 0.84], [48, 1.08]] as const) gem(t, 4, at, hz(m), 0.45);
      pad(t, 1.08, 1.7, [60, 64, 67, 72], 0.15, 0.05, 0.9, 2000);
      [84, 88, 91].forEach((m, i) => gem(t, 1, 1.08 + i * 0.03, hz(m), 0.38 - i * 0.08));
      sparkle(t, 1.12, 0.9, 14, [91, 93, 96, 98, 100], 0.07);
      t.echo(0.18, 0.2, 0.14, 2500);
    },
  },
  lose: {
    dur: 2, db: -2, room: 0.32,
    draw(t) {
      [76, 74, 69].forEach((m, i) => gem(t, 4, i * 0.22, hz(m), 0.45));
      pad(t, 0.66, 1.3, [60, 67], 0.2, 0.15, 0.7, sweep(1500, 500));
      t.tone(0.66, 1.3, hz(48), { amp: 0.2, attack: 0.15, decay: 0.6 });
    },
  },
  star: {
    dur: 1.1, room: 0.3,
    draw(t) {
      gem(t, 3, 0, hz(84), 0.7);
      gem(t, 1, 0, hz(72), 0.3);
      t.tone(0, 0.2, sweep(220, 110), { amp: 0.3, attack: 0.002, decay: 0.04 });
      sparkle(t, 0.02, 0.35, 6, [91, 96, 98, 100], 0.06);
    },
  },
  perk_pick: {
    dur: 1.5, jitter: 0.05, room: 0.32,
    draw(t) {
      [67, 69, 72, 74, 76, 79].forEach((m, i) => gem(t, 2, i * 0.035, hz(m), 0.32 + i * 0.04));
      gem(t, 1, 0.22, hz(84), 0.5);
      gem(t, 3, 0.22, hz(91), 0.18);
      pad(t, 0.1, 1.1, [60, 67], 0.2, 0.15, 0.6, 1600);
      sparkle(t, 0.3, 0.6, 6, [88, 91, 93, 96], 0.06);
    },
  },
  reforge_token: {
    dur: 1.8, db: 0.5, jitter: 0.05, room: 0.3,
    draw(t) {
      // Anvil-ish strike: inharmonic bar partials + a little FM metal, a hammer thunk, then a shimmering roll.
      const f = 440;
      [[1, 0.6, 0.9], [2.32, 0.35, 0.5], [4.25, 0.18, 0.25], [6.63, 0.08, 0.12]].forEach(([r, a, d]) => t.modal(0, f * r!, a!, d!, 0.0008));
      t.mix(env(fm(t.sr, 1.2, f, 2.76, 1.2, 0.08), t.sr, 0.001, 0.5, 0.1), 0, 0.25)
        .tone(0, 0.15, sweep(180, 90), { amp: 0.55, attack: 0.002, decay: 0.04 })
        .burst(0, 0.03, { amp: 0.3, bp: 2200, q: 1, attack: 0.0005, decay: 0.005 })
        .tone(0.05, 1.2, hz(88), { amp: 0.15, attack: 0.1, decay: 0.5, shape: (u) => 0.6 + 0.4 * Math.sin(u * 1.2 * TAU * 7) })
        .grains(0.15, 0.8, 10, 1, (at, u) => ping(t, at, hz([81, 84, 86, 88, 91, 93][Math.floor(u * 6)] ?? 93), 0.1, 0.2));
    },
  },

  ui_click: {
    dur: 0.2, db: -9, variants: 2, jitter: 0.3, room: 0.08,
    draw(t, k) {
      const f = k.variant ? 1100 : 980;
      t.modal(0, f, 0.7, 0.012, 0.0006).modal(0, f * 2.4, 0.12, 0.006, 0.0005).modal(0, f * 0.5, 0.3, 0.02, 0.0008)
        .burst(0, 0.01, { amp: 0.12, lp: 3000, attack: 0.0004, decay: 0.002 });
    },
  },
  ui_open: {
    dur: 0.55, db: -6, jitter: 0.1, room: 0.2,
    draw(t) {
      t.tone(0, 0.25, sweep(hz(67), hz(79), 0.5), { amp: 0.5, attack: 0.006, decay: 0.08 });
      gem(t, 3, 0.05, hz(84), 0.3);
      t.burst(0, 0.2, { amp: 0.08, bp: sweep(700, 2500), q: 1.4, attack: 0.05, decay: 0.05 });
    },
  },
  ui_close: {
    dur: 0.5, db: -7, jitter: 0.1, room: 0.2,
    draw(t) {
      t.tone(0, 0.22, sweep(hz(79), hz(67), 0.5), { amp: 0.5, attack: 0.006, decay: 0.07 });
      gem(t, 4, 0.04, hz(67), 0.3);
      t.burst(0, 0.18, { amp: 0.07, bp: sweep(2200, 600), q: 1.4, attack: 0.03, decay: 0.05 });
    },
  },
  level_start: {
    dur: 1.5, room: 0.3,
    draw(t) {
      [67, 72, 76, 79].forEach((m, i) => gem(t, 0, i * 0.1, hz(m), 0.5));
      gem(t, 3, 0.3, hz(84), 0.3);
      pad(t, 0, 1.2, [60, 67], 0.18, 0.2, 0.6, 1600);
      t.burst(0, 0.35, { amp: 0.1, bp: sweep(500, 2000), q: 1.2, attack: 0.2, decay: 0.08 });
    },
  },
};

// ---- buffers and play resolution -------------------------------------------------------------------------------

/** Preferred render rate: plenty for these gentle sounds, ~1/3 cheaper than 48 kHz. */
export const RENDER_RATE = 32000;

export function bufferKeyString(k: BufferKey): string {
  return `${k.id}.${k.color}.${k.step}.${k.variant}`;
}

const COLORED: ReadonlySet<RecipeId> = new Set<RecipeId>(['clear', 'power_charge']);

/** Every buffer the sound set uses, most urgent first (warm-up order). */
export function allBufferKeys(): BufferKey[] {
  const keys: BufferKey[] = [];
  const add = (id: RecipeId) => {
    const variants = R[id].variants ?? 1;
    const colors = COLORED.has(id) ? 5 : 1;
    const steps = id === 'clear' ? CLEAR_ANCHORS : [0];
    for (const step of steps) for (let color = 0; color < colors; color++) for (let variant = 0; variant < variants; variant++) {
      keys.push({ id, color, step, variant });
    }
  };
  const first: RecipeId[] = ['ui_click', 'tap_invalid', 'clear', 'dirt_crack', 'dirt_break', 'crust_chip', 'level_start'];
  first.forEach(add);
  for (const id of Object.keys(R) as RecipeId[]) if (!first.includes(id)) add(id);
  return keys;
}

function seedOf(k: BufferKey): number {
  let h = 2166136261;
  for (const ch of bufferKeyString(k)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Renders one buffer: recipe, saturation, reverb, then loudness mastering. Deterministic. */
export function renderBuffer(k: BufferKey, sampleRate: number): Float32Array {
  const r = R[k.id];
  const t = new Track(sampleRate, r.dur, new Rng(seedOf(k)));
  r.draw(t, k);
  if (r.warm) t.saturate(r.warm);
  if (r.room && k.id !== 'clear') t.room(r.room, r.size ?? 0.8, 0.4);
  return master(t.out, sampleRate, { targetDb: TARGET_DB + (r.db ?? 0) });
}

/** One buffer to start for a play call. */
export interface PlayLayer {
  key: BufferKey;
  /** Transpose in semitones (playback rate). */
  semis: number;
  gain: number;
  /** Start delay, seconds. */
  delay: number;
}

const clampInt = (v: number | undefined, lo: number, hi: number, dflt: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v as number))) : dflt;

/** Turns a play request into buffers, transposes and gains. `random` returns [0, 1) (variation). */
export function resolvePlay(rawId: SoundId, opts: PlayOptions = {}, random: () => number = Math.random): PlayLayer[] {
  const id: (typeof SOUND_IDS)[number] = rawId in LEGACY_SOUND_ALIASES ? LEGACY_SOUND_ALIASES[rawId as LegacySoundId] : rawId as (typeof SOUND_IDS)[number];
  const r = R[id];
  if (!r) return [];
  const jitter = () => (r.jitter ?? 0) * (random() * 2 - 1);
  const variant = Math.min((r.variants ?? 1) - 1, Math.floor(random() * (r.variants ?? 1)));
  const color = clampInt(opts.color, 0, 4, 0);
  const level = clampInt(opts.level, 1, 5, 1);
  const index = clampInt(opts.index, 0, 1000, 0);
  const userPitch = Number.isFinite(opts.pitch) ? (opts.pitch as number) : 0;
  const key = (rid: RecipeId, step = 0, c = 0, v = 0): BufferKey => ({ id: rid, color: c, step, variant: v });
  const layers: PlayLayer[] = [];

  switch (id) {
    case 'clear': {
      const size = Number.isFinite(opts.size) ? (opts.size as number) : 2;
      const pitch = Number.isFinite(opts.pitch) ? (opts.pitch as number) : clearPitchForGroupSize(size);
      const anchor = CLEAR_ANCHORS.reduce((best, a) => (Math.abs(a - pitch) < Math.abs(best - pitch) ? a : best), CLEAR_ANCHORS[0]);
      layers.push({ key: key('clear', anchor, color), semis: pitch - anchor + jitter(), gain: 1, delay: 0 });
      if (size >= 9) layers.push({ key: key('clear_shimmer'), semis: pitch - 16, gain: size >= 15 ? 0.8 : 0.55, delay: 0.02 + random() * 0.03 });
      if (size >= 15) layers.push({ key: key('clear_chord'), semis: pitch - 19, gain: 0.65, delay: 0.01 });
      return layers;
    }
    case 'power_charge':
      layers.push({ key: key('power_charge', 0, color), semis: (level - 1) * 2 + jitter(), gain: 1, delay: 0 });
      if (level >= 3) layers.push({ key: key('charge_full'), semis: (level - 1) * 2, gain: (level - 2) / 3, delay: 0 });
      return layers;
    case 'power_merge':
      return [{ key: key(id), semis: Math.max(0, level - 2) * 2 + jitter(), gain: 1, delay: 0 }];
    case 'fire': case 'wave': case 'quake': case 'lightning': case 'drill':
      layers.push({ key: key(id), semis: userPitch + jitter(), gain: Math.min(1, 0.8 + 0.05 * level), delay: 0 });
      if (level >= 3) layers.push({ key: key('power_impact'), semis: userPitch, gain: 0.25 * (level - 2), delay: 0 });
      return layers;
    case 'zap':
      return [{ key: key(id, 0, 0, variant), semis: ([0, 2, 4, 7, 9, 12][index % 6] ?? 0) - 4 + jitter(), gain: 1, delay: 0 }];
    case 'star':
      return [{ key: key(id), semis: [0, 4, 7, 12][Math.min(index, 3)] ?? 0, gain: 1, delay: 0 }];
    default:
      return [{ key: key(id, 0, 0, variant), semis: userPitch + jitter(), gain: 1, delay: 0 }];
  }
}

/**
 * Renders a whole play request (all layers, transposed by resampling) to one mono buffer. For previews, WAV export
 * and tests; the game itself plays the cached buffers through Web Audio.
 */
export function renderSound(id: SoundId, sampleRate: number, opts: PlayOptions = {}, random: () => number = () => 0.5): Float32Array {
  const layers = resolvePlay(id, opts, random);
  const parts = layers.map((l) => ({ l, b: renderBuffer(l.key, sampleRate), rate: 2 ** (l.semis / 12) }));
  const len = Math.max(1, ...parts.map((p) => Math.ceil(p.b.length / p.rate + p.l.delay * sampleRate)));
  const out = new Float32Array(len);
  for (const { l, b, rate } of parts) {
    const off = Math.round(l.delay * sampleRate);
    for (let i = 0; off + i < len; i++) {
      const x = i * rate, j = Math.floor(x);
      if (j + 1 >= b.length) break;
      out[off + i]! += (b[j]! + (b[j + 1]! - b[j]!) * (x - j)) * l.gain;
    }
  }
  return out;
}
