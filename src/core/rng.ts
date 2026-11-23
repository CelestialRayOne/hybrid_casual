// Seeded RNG for the core. All randomness in the rules engine goes through here so that
// the same seed + the same actions always give the same board.
//
// Generator: mulberry32 by Tommy Ettinger, released into the public domain (CC0).
// Vendored from the reference implementation; the only change is that the state is passed
// in and returned explicitly so it can live inside the JSON-serialisable LevelState.

/** Returns a float in [0, 1) and the next state. `state` is any uint32. */
export function nextRandom(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Returns an integer in [0, n) and the next state. `n` must be >= 1. */
export function nextInt(state: number, n: number): [value: number, nextState: number] {
  const [v, s] = nextRandom(state);
  return [Math.floor(v * n), s];
}

/**
 * Mixes any number of integers into one uint32 seed (murmur3-style finaliser per input).
 * Used to derive independent streams, e.g. `hashSeed(def.seed, def.id)`.
 */
export function hashSeed(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    let k = (v | 0) >>> 0;
    k = Math.imul(k ^ (k >>> 16), 0x85ebca6b);
    k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35);
    k ^= k >>> 16;
    h = Math.imul(h ^ k, 0x27d4eb2d) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
  }
  return h >>> 0;
}

/**
 * Small mutable wrapper for code that draws many numbers in a row (the generator, perk offers).
 * Not stored in game state; LevelState keeps a plain `rngState` number instead.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    const [v, s] = nextRandom(this.state);
    this.state = s;
    return v;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[this.int(items.length)] as T;
  }

  /** Picks an index with probability proportional to `weights[i]`. */
  weighted(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i] ?? 0);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** In-place Fisher-Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}
