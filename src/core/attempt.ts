// Per-attempt randomness (docs/spec.md, "Randomness (v2)"). The level's STRUCTURE (depth, dirt, bedrock,
// goal relics, colour count, moves) comes from the LevelDef; each attempt re-rolls, from its own seed:
//   1. gem colours, with the level's clustering (pinned cells keep their authored colour);
//   2. geodes (about 1 gem in 60, more on boss levels; never on pinned cells);
//   3. relic types (each type = a boon) for goal relics without a pinned variant;
//   4. bonus relics: def.bonusRelics range + Treasure Sense, at random VALID spots (bonusRelicSpots).
// Deterministic for (def, perks, attemptSeed).
import { relicNeighbours } from './board';
import { Rng } from './rng';
import { BOON_IDS, COLUMNS } from './types';
import type { Cell, GemColor, LevelState, Pos, Relic } from './types';

/** Chance that a bonus relic is 2x2 (when a 2x2 spot exists). */
export const BONUS_LARGE_CHANCE = 0.2;
/** Bonus relics never sit in the top rows of the level (they would scroll away before they matter). */
export const BONUS_MIN_ROW = 4;

export function rollColours(state: LevelState, rng: Rng): void {
  const def = state.def;
  const pinned = new Set(def.pinned.map((p) => p.y * COLUMNS + p.x));
  const g = state.grid;
  for (let y = 0; y < g.length; y++) {
    const row = g[y]!;
    for (let x = 0; x < COLUMNS; x++) {
      const c = row[x]!;
      if (c.kind !== 'block' || pinned.has(y * COLUMNS + x)) continue;
      let color = rng.int(def.colors) as GemColor;
      if (rng.chance(def.cluster)) {
        const options: GemColor[] = [];
        const left = row[x - 1];
        const up = g[y - 1]?.[x];
        if (left?.kind === 'block') options.push(left.color);
        if (up?.kind === 'block') options.push(up.color);
        if (options.length) color = rng.pick(options);
      }
      row[x] = rng.chance(def.geodeRate) ? { kind: 'block', color, geode: true } : { kind: 'block', color };
    }
  }
}

/**
 * Valid top-left spots for a bonus relic of `size`:
 * - every footprint cell is a gem (not pinned), at row >= BONUS_MIN_ROW and no shallower than one row above
 *   the shallowest goal relic (any relic counts towards the goal, so a shallow bonus relic would let the
 *   player skip the dig: on a 1-relic level it won in 2 moves);
 * - no other relic and no bedrock within Chebyshev distance 2 of the footprint (relics stay apart and never
 *   form walls with slabs);
 * - at least 2 orthogonal neighbours are gems, and at most 1 is dirt, so the relic never seals a pocket or a
 *   column and can always be chipped by clears.
 */
export function bonusRelicSpots(state: LevelState, size: 1 | 2): Pos[] {
  const g = state.grid;
  const pinned = new Set(state.def.pinned.map((p) => p.y * COLUMNS + p.x));
  const out: Pos[] = [];
  const isGem = (x: number, y: number) => g[y]?.[x]?.kind === 'block' && !pinned.has(y * COLUMNS + x);
  const firstGoal = Math.min(...state.def.relics.map((r) => r.y));
  for (let y = Math.max(BONUS_MIN_ROW, firstGoal - 1); y + size <= g.length; y++) {
    for (let x = 0; x + size <= COLUMNS; x++) {
      let ok = true;
      for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size && ok; dx++) ok = isGem(x + dx, y + dy);
      if (!ok) continue;
      const fp = { x, y, size };
      if (state.relics.some((r) => overlapsNear(r, fp))) continue;
      let rock = false;
      for (let yy = y - 2; yy < y + size + 2 && !rock; yy++) {
        for (let xx = x - 2; xx < x + size + 2 && !rock; xx++) if (g[yy]?.[xx]?.kind === 'bedrock') rock = true;
      }
      if (rock) continue;
      let gems = 0;
      let dirt = 0;
      for (const n of relicNeighbours(fp)) {
        const c = g[n.y]?.[n.x];
        if (c?.kind === 'block') gems++;
        else if (c?.kind === 'dirt') dirt++;
      }
      if (gems >= 2 && dirt <= 1) out.push({ x, y });
    }
  }
  return out;
}

/** Chebyshev gap between two footprints <= 2. */
function overlapsNear(a: Pick<Relic, 'x' | 'y' | 'size'>, b: Pick<Relic, 'x' | 'y' | 'size'>): boolean {
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.size - 1, b.x + b.size - 1));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.size - 1, b.y + b.size - 1));
  return Math.max(gapX, gapY) <= 2;
}

/** Relic type (= art variant = boon) for a new relic. */
function rollVariant(rng: Rng): number {
  return rng.int(BOON_IDS.length);
}

export function rollRelicTypes(state: LevelState, rng: Rng): void {
  state.def.relics.forEach((d, i) => {
    const r = state.relics[i]!;
    r.variant = d.variant ?? rollVariant(rng);
    r.boon = BOON_IDS[r.variant]!;
  });
}

/** Places this attempt's bonus relics. Returns how many were placed (fewer if spots run out). */
export function placeBonusRelics(state: LevelState, rng: Rng): number {
  const [lo, hi] = state.def.bonusRelics;
  const want = lo + rng.int(Math.max(0, hi - lo) + 1) + state.rules.bonusRelics;
  let placed = 0;
  for (let n = 0; n < want; n++) {
    let size: 1 | 2 = rng.chance(BONUS_LARGE_CHANCE) ? 2 : 1;
    let spots = bonusRelicSpots(state, size);
    if (!spots.length && size === 2) {
      size = 1;
      spots = bonusRelicSpots(state, 1);
    }
    if (!spots.length) break;
    const at = rng.pick(spots);
    const id = state.relics.reduce((m, r) => Math.max(m, r.id + 1), 0);
    const variant = rollVariant(rng);
    state.relics.push({
      id,
      x: at.x,
      y: at.y,
      size,
      crust: state.rules.crustHp,
      collected: false,
      variant,
      boon: BOON_IDS[variant]!,
      bonus: true,
    });
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) (state.grid[at.y + dy] as Cell[])[at.x + dx] = { kind: 'relic', id };
    }
    placed++;
  }
  return placed;
}

/** All of the attempt's randomness, in a fixed order. */
export function rollAttempt(state: LevelState, rng: Rng): void {
  rollColours(state, rng);
  rollRelicTypes(state, rng);
  placeBonusRelics(state, rng);
}
