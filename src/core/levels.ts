// Hand-authored levels 1-5 (the onboarding curve in docs/spec.md).
//
// ASCII format, one string per row, 8 characters each (case-sensitive):
//   o           gem with a RANDOM colour per attempt (the level's clustering)
//   r b g y p   PINNED gem: ruby, sapphire, emerald, topaz, amethyst (GemColor 0..4), same on every attempt
//               (scripted tutorial groups and their borders)
//   1 2 3       dirt with that many hp
//   A B C D     goal relic 0..3 (1 cell = 1x1 relic, a 2x2 square = 2x2 relic)
//   X W V U     bedrock slab 0..3 (2-4 orthogonally connected cells)
//   .           empty
// Move budgets come from the calibrated table in levelTable.ts (see calibrate.ts).
import { LEVEL_MOVES } from './levelTable';
import type { Cell, GemColor, LevelDef, Pos, PowerLevel, TutorialId } from './types';

const GEMS: Record<string, GemColor> = { r: 0, b: 1, g: 2, y: 3, p: 4 };
const RELICS = 'ABCD';
const BEDROCK = 'XWVU';

export interface AsciiLevel {
  id: number;
  seed: number;
  colors: number;
  moves: number | null;
  hard?: boolean;
  boss?: boolean;
  rows: readonly string[];
  cluster?: number;
  bonusRelics?: readonly [number, number];
  geodeRate?: number;
  startPowers?: readonly { color: GemColor; level: PowerLevel }[];
  tutorial?: readonly TutorialId[];
  /** Pinned relic type (art variant / boon index) per relic id; default: random per attempt. */
  variants?: readonly (number | undefined)[];
}

/** Parses the ASCII format above into a LevelDef. Throws on unknown characters or ragged rows. */
export function parseAsciiLevel(src: AsciiLevel): LevelDef {
  const relicCells = new Map<number, { x: number; y: number }[]>();
  const pinned: Pos[] = [];
  const rows: Cell[][] = src.rows.map((line, y) => {
    if (line.length !== 8) throw new Error(`level ${src.id} row ${y}: expected 8 cells, got ${line.length}`);
    return [...line].map((ch, x): Cell => {
      if (ch === '.') return { kind: 'empty' };
      if (ch === 'o') return { kind: 'block', color: ((x + y) % src.colors) as GemColor }; // placeholder colour
      const gem = GEMS[ch];
      if (gem !== undefined) {
        pinned.push({ x, y });
        return { kind: 'block', color: gem };
      }
      if (ch >= '1' && ch <= '3') return { kind: 'dirt', hp: Number(ch) };
      const r = RELICS.indexOf(ch);
      if (r >= 0) {
        relicCells.set(r, [...(relicCells.get(r) ?? []), { x, y }]);
        return { kind: 'relic', id: r };
      }
      const b = BEDROCK.indexOf(ch);
      if (b >= 0) return { kind: 'bedrock', id: b };
      throw new Error(`level ${src.id} row ${y}: unknown cell '${ch}'`);
    });
  });
  const relics = [...relicCells.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, cells]) => {
      const r: LevelDef['relics'][number] = {
        id,
        x: Math.min(...cells.map((c) => c.x)),
        y: Math.min(...cells.map((c) => c.y)),
        size: (cells.length === 4 ? 2 : 1) as 1 | 2,
      };
      const v = src.variants?.[id];
      if (v !== undefined) r.variant = v;
      return r;
    });
  const def: LevelDef = {
    id: src.id,
    seed: src.seed,
    colors: src.colors,
    moves: src.moves,
    hard: src.hard ?? false,
    boss: src.boss ?? false,
    rows,
    relics,
    cluster: src.cluster ?? 0.3,
    bonusRelics: src.bonusRelics ?? [0, 0],
    geodeRate: src.geodeRate ?? 0,
    pinned,
    startPowers: (src.startPowers ?? []).map((p) => ({ ...p })),
  };
  if (src.tutorial) def.tutorial = [...src.tutorial];
  return def;
}

/**
 * Level 1: tap. No move limit. A pinned 5-topaz group (the hand points at it; 5 so it does not charge a
 * power yet) sits under a two-row empty surface; the 2x2 relic is just below the first view (its outline
 * peeks under the board), so the player digs. Random tapping always wins (levels.test.ts).
 */
const L1: AsciiLevel = {
  id: 1,
  seed: 101,
  colors: 4,
  moves: null,
  cluster: 0.25,
  tutorial: ['tap'],
  rows: [
    '........',
    '........',
    '.yyy..oo',
    'ryyroooo',
    'gbbgoooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooAAooo',
    'oooAAooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
  ],
};

/**
 * Level 2: dirt, and the first power. A pinned 7-sapphire group at the top charges a Lv1 Tidal Wave
 * ("Tap to arm"); its border is pinned to other colours so the group is exactly 7 on every attempt.
 */
const L2: AsciiLevel = {
  id: 2,
  seed: 202,
  colors: 4,
  moves: LEVEL_MOVES[1] as number,
  cluster: 0.3,
  geodeRate: 0.01,
  tutorial: ['dirt', 'charge'],
  rows: [
    'oorbbbro',
    'orbbbbro',
    'oogrrgoo',
    'oooooooo',
    'oooooooo',
    'o1ooo1oo',
    'oooooooo',
    '1ooooo1o',
    'oooooooo',
    'ooo11ooo',
    'oooooooo',
    'oo1Aoooo',
    'ooo1oooo',
    'oooooooo',
    'o1oooo1o',
    'oooooooo',
    'ooooo1oo',
    'oooooooo',
    'o1oooooo',
    'oooooo1o',
    'oooooooo',
    'oooooooo',
  ],
};

/** Level 3: using an armed power. Starts with a Lv2 Drill; the relic sits in a dirt pocket below. */
const L3: AsciiLevel = {
  id: 3,
  seed: 303,
  colors: 4,
  moves: LEVEL_MOVES[2] as number,
  cluster: 0.3,
  geodeRate: 0.012,
  bonusRelics: [0, 1],
  startPowers: [{ color: 4, level: 2 }],
  tutorial: ['use'],
  rows: [
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'oo1ooo1o',
    'oooooooo',
    'ooooo1oo',
    'oo2ooooo',
    'oooo2ooo',
    'oooooooo',
    'oo1oo1oo',
    'oo1A1ooo',
    'oooooooo',
    '1ooooo1o',
    'oooooooo',
    'oooo2ooo',
    'oo1ooooo',
    'oooooo2o',
    'oooooooo',
    'ooo2oooo',
    'oooooooo',
  ],
};

/** Level 4: a normal level with two relics and the first bonus relics. */
const L4: AsciiLevel = {
  id: 4,
  seed: 404,
  colors: 4,
  moves: LEVEL_MOVES[3] as number,
  cluster: 0.3,
  geodeRate: 0.016,
  bonusRelics: [0, 1],
  rows: [
    'ooo1oooo',
    'oooooo1o',
    'oooooooo',
    '1ooooooo',
    'oooooo1o',
    'oooo2ooo',
    'oooAoooo',
    'ooooo1oo',
    'oo1ooooo',
    'oooooo2o',
    'oooooooo',
    '1ooooooo',
    'ooo2ooo1',
    'oooBBooo',
    'oooBBooo',
    'oo1ooo2o',
    'oooooooo',
    'oo2ooooo',
    'ooooo1oo',
    'oooooooo',
  ],
};

/**
 * Level 5: bedrock, and the first BOSS level (the climax of the onboarding stretch). A T-shaped slab caps the
 * second relic; the level starts with a free Lv1 Earthshaker ("Powers break stone"). As a boss it rolls
 * 2-3 bonus relics and more geodes, but keeps the onboarding win target.
 */
const L5: AsciiLevel = {
  id: 5,
  seed: 505,
  colors: 4,
  moves: LEVEL_MOVES[4] as number,
  boss: true,
  cluster: 0.32,
  geodeRate: 0.03,
  bonusRelics: [2, 3],
  startPowers: [{ color: 2, level: 1 }],
  tutorial: ['bedrock'],
  rows: [
    'oooooooo',
    'oooooooo',
    'oooooooo',
    'ooooooo1',
    '1ooooooo',
    'oooooooo',
    'ooo1oooo',
    'ooooooo1',
    'oooooooo',
    'oooooo2o',
    'oooAoooo',
    'oo1ooooo',
    'oooooo2o',
    'oo1ooooo',
    'ooXXXooo',
    'oooXoooo',
    'oooBoooo',
    'oooooooo',
    'o1oooooo',
    'oooooo1o',
    'oooooooo',
    'oo2ooooo',
    'oooooooo',
  ],
};

export const AUTHORED_ASCII: readonly AsciiLevel[] = [L1, L2, L3, L4, L5];
export const AUTHORED_LEVELS: readonly LevelDef[] = AUTHORED_ASCII.map(parseAsciiLevel);
