// Seeded level generator (levels 6-20) and the level lookup for all 20 levels.
//
// A LevelDef is the level's STRUCTURE; gem colours, geodes, relic types and bonus relics are rolled per
// attempt by createLevelState (attempt.ts). The generator therefore builds:
//   1. A column of placeholder gems, goal relics at fixed rows, bedrock slabs (2-4 cells, random shapes):
//      first caps over the deepest `sealed` goal relics (each adds a free Lv1 start power of a random colour),
//      then free slabs away from relics; then dirt in short horizontal veins whose density and hp rise
//      with depth.
//   2. Structural rejection (validateLevelDef, a goal relic with < 2 gem neighbours).
//   3. A solvability check: the greedy bot plays attempt GEN_CHECK_ATTEMPT with unlimited moves and must win
//      with at most 1 rescue power. A start view with < 3 groups is rejected too.
//   4. moves = LEVEL_MOVES[id - 1] (levelTable.ts), calibrated over many random attempts with the casual
//      player model (calibrate.ts). Only ids without a table entry fall back to ceil(botMoves * 1.4).
// Seeds are walked deterministically (seed, seed+1, ...). LEVEL_PARAMS pins seeds that are accepted on the
// first attempt, so getLevel normally costs one candidate + one bot run.
import { playBotFrom } from './bot';
import { listGroups, relicNeighbours } from './board';
import { createLevelState, sealingBedrock, validateLevelDef } from './level';
import { LEVEL_MOVES } from './levelTable';
import { AUTHORED_LEVELS } from './levels';
import { Rng, hashSeed } from './rng';
import { BOON_IDS, COLUMNS, LEVEL_COUNT } from './types';
import type { Cell, GemColor, LevelDef, Pos, Relic } from './types';

export { LEVEL_COUNT } from './types';
/** Number of relic art variants the view can draw; `Relic.variant` is in [0, RELIC_VARIANTS). */
export const RELIC_VARIANTS = BOON_IDS.length;
export const MAX_GENERATOR_ATTEMPTS = 60;
/** The attempt seed the generator's solvability check plays. */
export const GEN_CHECK_ATTEMPT = 1;
/** Base geode rate (about 1 gem in 60) and the boss-level rate. */
export const GEODE_RATE = 1 / 60;
export const BOSS_GEODE_RATE = 0.04;

type HpWeights = readonly [hp1: number, hp2: number, hp3: number];

export interface LevelParams {
  id: number;
  /** First seed tried; the generator walks seed, seed + 1, ... */
  seed: number;
  /** Rows in the level column (20-60). */
  depth: number;
  colors: 4 | 5;
  /** 0..1: chance a gem copies its left or upper neighbour's colour (used per attempt). */
  cluster: number;
  /** Dirt density (fraction of cells) at the top and at the bottom of the column; linear between. */
  dirt: readonly [top: number, bottom: number];
  /** Dirt hp weights at the top and at the bottom; interpolated by depth. */
  dirtHp: readonly [top: HpWeights, bottom: HpWeights];
  /** No dirt above this row. */
  dirtFrom: number;
  /** Free bedrock slabs (not touching relics). */
  bedrock: number;
  /** How many goal relics (the deepest ones) are capped by a slab; each adds a free start power. Max 2. */
  sealed: number;
  /** Goal relic rows (top-left row) and sizes, 1-4 entries. The goal is their count. */
  relics: readonly { row: number; size: 1 | 2 }[];
  hard: boolean;
  /** Boss level: the climax of a 5-level stretch (many bonus relics, more geodes). */
  boss: boolean;
  /** Bonus relics per attempt (inclusive range). */
  bonus: readonly [min: number, max: number];
  geodeRate: number;
  /** Levels 1-5 are hand-authored (levels.ts); their params are descriptive only. */
  authored?: boolean;
}

/** Weights for vein lengths 1, 2, 3. */
const VEIN_LENGTH = [0.3, 0.45, 0.25] as const;
/** Weights for slab sizes 2, 3, 4. */
const SLAB_SIZE = [0.3, 0.4, 0.3] as const;
const EASY_HP: HpWeights = [1, 0, 0];
const MID_HP: HpWeights = [0.6, 0.3, 0.1];
const DEEP_HP: HpWeights = [0.35, 0.4, 0.25];

type R = LevelParams['relics'][number];
const r1 = (row: number): R => ({ row, size: 1 });
const r2 = (row: number): R => ({ row, size: 2 });

function p(id: number, seed: number, depth: number, colors: 4 | 5, relics: readonly R[], o: Partial<LevelParams> = {}): LevelParams {
  const boss = o.boss ?? false;
  return {
    id,
    seed,
    depth,
    colors,
    relics,
    cluster: colors === 5 ? 0.42 : 0.3,
    dirt: [0.06, 0.16],
    dirtHp: [EASY_HP, MID_HP],
    dirtFrom: 3,
    bedrock: 0,
    sealed: 0,
    hard: false,
    boss,
    bonus: [0, 2],
    geodeRate: boss ? BOSS_GEODE_RATE : GEODE_RATE,
    ...o,
  };
}

const deep = { dirtHp: [MID_HP, DEEP_HP] as const };

/**
 * The content table for levels 1..20 (index = id - 1). Boss levels: 5, 10, 15, 20 (the end of each 5-level
 * stretch); 10, 15 and 20 are also `hard` (lower win-rate target), level 5 is an onboarding boss.
 */
export const LEVEL_PARAMS: readonly LevelParams[] = Object.freeze([
  // Hand-authored (levels.ts). Descriptive only.
  p(1, 0, 20, 4, [r2(10)], { authored: true, dirt: [0, 0], bonus: [0, 0], geodeRate: 0 }),
  p(2, 0, 22, 4, [r1(11)], { authored: true, bonus: [0, 0] }),
  p(3, 0, 22, 4, [r1(12)], { authored: true, bonus: [0, 1] }),
  p(4, 0, 20, 4, [r1(6), r2(13)], { authored: true, bonus: [0, 1] }),
  p(5, 0, 23, 4, [r1(10), r1(16)], { authored: true, sealed: 1, boss: true, bonus: [2, 3] }),
  // Generated.
  p(6, 601, 22, 4, [r1(9), r1(16)], { bedrock: 1, bonus: [0, 1] }),
  p(7, 701, 24, 4, [r1(8), r1(14), r1(20)], { bedrock: 1, bonus: [0, 1] }),
  p(8, 801, 24, 4, [r2(19)], { bedrock: 2, dirt: [0.08, 0.2] }),
  p(9, 901, 26, 4, [r1(12), r1(21)], { bedrock: 2, sealed: 1, dirt: [0.08, 0.2] }),
  p(10, 1001, 28, 4, [r1(10), r2(16), r1(22)], {
    hard: true, boss: true, bonus: [2, 3], bedrock: 2, sealed: 1, dirt: [0.1, 0.24], ...deep,
  }),
  p(11, 1101, 24, 5, [r1(11), r1(18)], { bedrock: 2 }),
  p(12, 1201, 26, 5, [r1(8), r1(13), r1(18), r1(22)], { bedrock: 2, dirt: [0.08, 0.2] }),
  p(13, 1301, 26, 5, [r2(21)], { bedrock: 3, sealed: 1, dirt: [0.08, 0.22], dirtHp: [EASY_HP, DEEP_HP] }),
  p(14, 1401, 26, 5, [r1(10), r1(16), r1(22)], { bedrock: 3, dirt: [0.1, 0.22], ...deep }),
  p(15, 1501, 30, 5, [r1(11), r2(18), r1(25)], {
    hard: true, boss: true, bonus: [2, 3], bedrock: 3, sealed: 2, dirt: [0.1, 0.26], ...deep,
  }),
  p(16, 1601, 28, 5, [r1(13), r2(22)], { bedrock: 3, sealed: 1, bonus: [0, 3], dirt: [0.1, 0.24], ...deep }),
  p(17, 1701, 32, 5, [r1(12), r1(20), r1(27)], { bedrock: 3, bonus: [0, 3], dirt: [0.1, 0.26], ...deep }),
  p(18, 1801, 32, 5, [r2(28)], { bedrock: 4, sealed: 1, bonus: [0, 3], dirt: [0.12, 0.26], ...deep }),
  p(19, 1901, 34, 5, [r1(10), r1(17), r1(24), r1(30)], { bedrock: 4, sealed: 1, bonus: [0, 3], dirt: [0.12, 0.28], ...deep }),
  p(20, 2001, 34, 5, [r1(12), r2(19), r1(26), r1(30)], {
    hard: true, boss: true, bonus: [2, 3], bedrock: 4, sealed: 2, dirt: [0.12, 0.3], ...deep,
  }),
]);

// ---- Candidate construction ----------------------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Chebyshev distance from a cell to a relic's footprint. */
function distToRelic(px: number, py: number, r: Pick<Relic, 'x' | 'y' | 'size'>): number {
  const dx = px < r.x ? r.x - px : px > r.x + r.size - 1 ? px - (r.x + r.size - 1) : 0;
  const dy = py < r.y ? r.y - py : py > r.y + r.size - 1 ? py - (r.y + r.size - 1) : 0;
  return Math.max(dx, dy);
}

/** A random polyomino of `size` cells grown from `start`. */
export function growSlab(rng: Rng, start: Pos, size: number): Pos[] {
  const cells: Pos[] = [start];
  const has = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
  for (let guard = 0; cells.length < size && guard < 50; guard++) {
    const from = rng.pick(cells);
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
    if (!has(from.x + dx, from.y + dy)) cells.push({ x: from.x + dx, y: from.y + dy });
  }
  return cells;
}

/** Builds one candidate (moves = null). Exported for tests and tooling. */
export function buildCandidate(params: LevelParams, seed: number): LevelDef {
  const rng = new Rng(hashSeed(seed, params.id, 0x6e6e));
  const h = params.depth;
  const colors = params.colors;
  const rows: Cell[][] = [];

  // 1. Placeholder gems (re-coloured per attempt).
  for (let y = 0; y < h; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < COLUMNS; x++) row.push({ kind: 'block', color: ((x + y) % colors) as GemColor });
    rows.push(row);
  }
  const set = (x: number, y: number, c: Cell) => {
    (rows[y] as Cell[])[x] = c;
  };
  const get = (x: number, y: number) => rows[y]?.[x];

  // 2. Goal relics.
  const relics: LevelDef['relics'] = [];
  params.relics.forEach((spec, id) => {
    const y = Math.max(3, Math.min(spec.row, h - spec.size));
    let x = rng.int(COLUMNS - spec.size + 1);
    for (let tries = 0; tries < 20; tries++) {
      const clash = relics.some((r) => distToRelic(x, y, r) < 3 || distToRelic(x + spec.size - 1, y + spec.size - 1, r) < 3);
      if (!clash) break;
      x = rng.int(COLUMNS - spec.size + 1);
    }
    relics.push({ id, x, y, size: spec.size });
    for (let dy = 0; dy < spec.size; dy++) for (let dx = 0; dx < spec.size; dx++) set(x + dx, y + dy, { kind: 'relic', id });
  });

  // 3. Bedrock: caps over the deepest `sealed` relics, then free slabs.
  let bedrockId = 0;
  const startPowers: LevelDef['startPowers'] = [];
  const fits = (cells: Pos[]) =>
    cells.every((c) => c.x >= 0 && c.x < COLUMNS && c.y >= 2 && c.y < h && get(c.x, c.y)?.kind === 'block');
  const nearOtherSlab = (cells: Pos[]) =>
    cells.some((c) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => get(c.x + dx, c.y + dy)?.kind === 'bedrock')));
  const placeSlab = (cells: Pos[]) => {
    for (const c of cells) set(c.x, c.y, { kind: 'bedrock', id: bedrockId });
    bedrockId++;
  };
  const sealedRelics = [...relics].sort((a, b) => b.y - a.y || b.id - a.id).slice(0, Math.min(2, params.sealed));
  for (const relic of sealedRelics) {
    for (let tries = 0; tries < 80; tries++) {
      const start = { x: relic.x + rng.int(relic.size), y: relic.y - 1 };
      const cells = growSlab(rng, start, 2 + rng.weighted(SLAB_SIZE));
      if (!fits(cells) || nearOtherSlab(cells)) continue;
      if (relics.some((r) => r.id !== relic.id && cells.some((c) => distToRelic(c.x, c.y, r) <= 1))) continue;
      placeSlab(cells);
      startPowers.push({ color: rng.int(5) as GemColor, level: 1 });
      break;
    }
  }
  for (let n = 0; n < params.bedrock; n++) {
    for (let tries = 0; tries < 80; tries++) {
      const start = { x: rng.int(COLUMNS), y: 5 + rng.int(Math.max(1, h - 6)) };
      const cells = growSlab(rng, start, 2 + rng.weighted(SLAB_SIZE));
      if (!fits(cells) || nearOtherSlab(cells)) continue;
      if (relics.some((r) => cells.some((c) => distToRelic(c.x, c.y, r) <= 1))) continue;
      placeSlab(cells);
      break;
    }
  }

  // 4. Dirt in short horizontal veins (1-3 cells, one hp per vein), denser and tougher with depth.
  //    At most 4 dirt cells per row so every row keeps draining.
  for (let y = params.dirtFrom; y < h; y++) {
    const t = h > 1 ? y / (h - 1) : 0;
    const target = Math.round(lerp(params.dirt[0], params.dirt[1], t) * COLUMNS + rng.next() - 0.5);
    const weights = [0, 1, 2].map((i) => lerp(params.dirtHp[0][i] as number, params.dirtHp[1][i] as number, t));
    let inRow = 0;
    for (let tries = 0; tries < 6 && inRow < Math.min(4, target); tries++) {
      const len = Math.min(1 + rng.weighted(VEIN_LENGTH), 4 - inRow);
      const x0 = rng.int(COLUMNS - len + 1);
      const cells = Array.from({ length: len }, (_, i) => x0 + i);
      if (!cells.every((x) => get(x, y)?.kind === 'block')) continue;
      const hp = 1 + rng.weighted(weights);
      for (const x of cells) set(x, y, { kind: 'dirt', hp });
      inRow += len;
    }
  }
  // Every relic keeps at least 2 gem neighbours (dirt next to it turns back into gems).
  for (const r of relics) {
    const ns = relicNeighbours(r).filter((c) => get(c.x, c.y) !== undefined && c.x >= 0 && c.x < COLUMNS);
    let gems = ns.filter((c) => get(c.x, c.y)?.kind === 'block').length;
    for (const c of ns) {
      if (gems >= 2) break;
      if (get(c.x, c.y)?.kind === 'dirt') {
        set(c.x, c.y, { kind: 'block', color: 0 });
        gems++;
      }
    }
  }

  return {
    id: params.id,
    seed,
    colors,
    moves: null,
    hard: params.hard,
    boss: params.boss,
    rows,
    relics,
    cluster: params.cluster,
    bonusRelics: params.bonus,
    geodeRate: params.geodeRate,
    pinned: [],
    startPowers,
  };
}

/** Why a candidate is rejected before the bot runs, or null. */
function structuralProblem(def: LevelDef, params: LevelParams): string | null {
  const errors = validateLevelDef(def);
  if (errors.length) return errors.join('; ');
  if (def.relics.length !== params.relics.length) return 'relic count';
  if (sealingBedrock(def).length !== Math.min(2, params.sealed)) return 'sealing count';
  for (const r of def.relics) {
    const gems = relicNeighbours(r).filter((c) => def.rows[c.y]?.[c.x]?.kind === 'block').length;
    if (gems < 2) return `relic ${r.id} has ${gems} gem neighbours`;
  }
  return null;
}

export interface GenerationReport {
  def: LevelDef;
  attempts: number;
  botMoves: number;
  powersCharged: number;
  powersUsed: number;
}

/** The calibrated move budget for a level id, or undefined if the table has none. */
function tableMoves(id: number): number | undefined {
  const m = id >= 1 && id <= LEVEL_COUNT ? LEVEL_MOVES[id - 1] : undefined;
  return typeof m === 'number' ? m : undefined;
}

/** Generates a level and reports how it was accepted. Deterministic. Throws if no seed works. */
export function generateLevelReport(params: LevelParams): GenerationReport {
  for (let attempt = 0; attempt < MAX_GENERATOR_ATTEMPTS; attempt++) {
    const seed = (params.seed + attempt) >>> 0;
    const def = buildCandidate(params, seed);
    if (structuralProblem(def, params)) continue;
    const state = createLevelState(def, [], GEN_CHECK_ATTEMPT);
    if (state.status !== 'playing' || state.relics.some((r) => r.collected) || listGroups(state).length < 3) continue;
    const bot = playBotFrom(state, { maxActions: 150 });
    if (!bot.won || bot.rescues > 1) continue;
    return {
      def: { ...def, moves: tableMoves(params.id) ?? Math.ceil(bot.movesUsed * 1.4) },
      attempts: attempt + 1,
      botMoves: bot.movesUsed,
      powersCharged: bot.powersCharged,
      powersUsed: bot.powersUsed,
    };
  }
  throw new Error(`Level ${params.id}: no acceptable seed in ${MAX_GENERATOR_ATTEMPTS} attempts from ${params.seed}`);
}

export function generateLevel(params: LevelParams): LevelDef {
  return generateLevelReport(params).def;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const cache = new Map<number, LevelDef>();

/**
 * Level definition for id 1..LEVEL_COUNT: 1-5 hand-authored, 6-20 generated and solvability-checked.
 * Deterministic and cached; the returned object is deep-frozen (createLevelState copies it).
 */
export function getLevel(id: number): LevelDef {
  const hit = cache.get(id);
  if (hit) return hit;
  if (!Number.isInteger(id) || id < 1 || id > LEVEL_COUNT) throw new Error(`No level ${id}`);
  const authored = AUTHORED_LEVELS.find((l) => l.id === id);
  const params = LEVEL_PARAMS[id - 1] as LevelParams;
  const def = deepFreeze(authored ? (JSON.parse(JSON.stringify(authored)) as LevelDef) : generateLevel(params));
  cache.set(id, def);
  return def;
}

/** Clears the getLevel cache (tests, tuning). */
export function clearLevelCache(): void {
  cache.clear();
}
