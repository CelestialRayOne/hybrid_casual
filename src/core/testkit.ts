// Test helpers (imported only by *.test.ts files).
import { createLevelState } from './level';
import { rulesFor } from './rules';
import { parseAsciiLevel } from './levels';
import { BOON_IDS } from './types';
import type { BoonId, Cell, GemColor, LevelDef, LevelState, PerkId, Power, PowerLevel } from './types';

export interface KitOptions {
  moves?: number | null;
  colors?: number;
  perks?: PerkId[];
  startPowers?: { color: GemColor; level: PowerLevel }[];
  bonusRelics?: [number, number];
  geodeRate?: number;
  seed?: number;
}

/**
 * LevelDef (id 99) from ASCII rows (see levels.ts for the format); rows are used as given. Letter gems are
 * PINNED, so createLevelState keeps their colours; 'o' gems are random per attempt.
 */
export function def(rows: string[], o: KitOptions = {}): LevelDef {
  return parseAsciiLevel({
    id: 99,
    seed: o.seed ?? 7,
    colors: o.colors ?? 5,
    moves: o.moves === undefined ? 20 : o.moves,
    rows,
    startPowers: o.startPowers ?? [],
    bonusRelics: o.bonusRelics ?? [0, 0],
    geodeRate: o.geodeRate ?? 0,
  });
}

/** Normal state (settled like the game does), attempt seed 1. */
export function level(rows: string[], o: KitOptions & { attempt?: number } = {}): LevelState {
  return createLevelState(def(rows, o), o.perks ?? [], o.attempt ?? 1);
}

/** A power for raw trays. */
export const pw = (color: GemColor, level: PowerLevel, seq = 0): Power => ({ color, level, seq });

/**
 * State with the grid exactly as written (no randomisation, no settle, no shuffle), at the given scroll and
 * with the given tray and boons. Every relic is a goal relic unless listed in `bonus`. For testing single rules.
 */
export function raw(
  rows: string[],
  o: KitOptions & { scroll?: number; tray?: Power[]; boons?: Partial<Record<BoonId, number>>; bonus?: number[]; geodes?: [number, number][] } = {},
): LevelState {
  const d = def(rows, o);
  const rules = rulesFor(o.perks ?? []);
  const scroll = o.scroll ?? 0;
  const boons = Object.fromEntries(BOON_IDS.map((b) => [b, o.boons?.[b] ?? 0])) as Record<BoonId, number>;
  const tray = o.tray ?? [];
  const s: LevelState = {
    def: d,
    attemptSeed: 0,
    grid: d.rows.map((r) => r.map((c) => ({ ...c }) as Cell)),
    relics: d.relics.map((r) => ({
      ...r,
      crust: rules.crustHp,
      collected: false,
      variant: 2,
      boon: 'compass' as BoonId, // the most neutral boon for rule tests
      bonus: o.bonus?.includes(r.id) ?? false,
    })),
    goal: d.relics.filter((r) => !(o.bonus ?? []).includes(r.id)).length,
    collected: 0,
    scroll,
    movesLeft: d.moves,
    movesUsed: 0,
    tray,
    armed: null,
    powerSeq: tray.reduce((m, p) => Math.max(m, p.seq + 1), 0),
    boons,
    transmutesLeft: rules.transmutesPerLevel,
    continueUsed: false,
    status: 'playing',
    rngState: 12345,
    maxDepth: scroll,
    rules,
    stats: {
      groups: 0,
      biggestGroup: 0,
      powersCharged: 0,
      powersUsed: 0,
      geodes: 0,
      bonusCollected: 0,
      reforgeTokens: 0,
      bigGroupRolled: false,
      bonusTokenGiven: false,
      rescues: 0,
      shuffles: 0,
    },
  };
  for (const [x, y] of o.geodes ?? []) {
    const c = s.grid[y]![x]!;
    if (c.kind === 'block') s.grid[y]![x] = { kind: 'block', color: c.color, geode: true };
  }
  return s;
}

/** Sets a relic's boon (and matching variant) in a raw state. */
export function setBoon(s: LevelState, relicId: number, boon: BoonId): void {
  const r = s.relics.find((x) => x.id === relicId)!;
  r.boon = boon;
  r.variant = BOON_IDS.indexOf(boon);
}

const GLYPH = 'rbgyp';
/** The grid back as ASCII rows (relics as A/B/C/D, bedrock as X/W/V/U by id). */
export function ascii(s: LevelState, from = 0, to = s.grid.length): string[] {
  return s.grid.slice(from, to).map((row) =>
    row
      .map((c) =>
        c.kind === 'empty'
          ? '.'
          : c.kind === 'block'
            ? GLYPH[c.color]
            : c.kind === 'dirt'
              ? String(c.hp)
              : c.kind === 'relic'
                ? 'ABCDEFGH'[c.id]
                : 'XWVU'[c.id],
      )
      .join(''),
  );
}

/** n rows of a filler pattern with no two equal neighbours (no groups): alternating r/b/g/y. */
export function noGroupRows(n: number): string[] {
  const a = 'rbrbrbrb';
  const b = 'gygygygy';
  return Array.from({ length: n }, (_, i) => (i % 2 ? b : a));
}
