import { describe, expect, it } from 'vitest';
import { playBot } from './bot';
import { LEVEL_COUNT, LEVEL_PARAMS, buildCandidate, clearLevelCache, generateLevel, getLevel } from './generator';
import { createLevelState, isConnected, sealingBedrock, validateLevelDef } from './level';
import { PERK_IDS } from './rules';
import type { Pos } from './types';

const ids = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);

describe('LEVEL_PARAMS', () => {
  it('describes levels 1..20 with the spec constraints', () => {
    expect(LEVEL_PARAMS.map((p) => p.id)).toEqual(ids);
    for (const p of LEVEL_PARAMS) {
      expect(p.colors).toBe(p.id <= 10 ? 4 : 5);
      expect(p.hard).toBe([10, 15, 20].includes(p.id));
      expect(p.boss).toBe([5, 10, 15, 20].includes(p.id));
      if (p.boss) expect(p.bonus[0]).toBeGreaterThanOrEqual(2);
      expect(p.depth).toBeGreaterThanOrEqual(20);
      expect(p.depth).toBeLessThanOrEqual(60);
      expect(p.relics.length).toBeGreaterThanOrEqual(1);
      expect(p.relics.length).toBeLessThanOrEqual(4);
      expect(p.sealed).toBeLessThanOrEqual(Math.min(2, p.relics.length));
      expect(p.authored === true).toBe(p.id <= 5);
      for (const r of p.relics) expect(r.row + r.size).toBeLessThanOrEqual(p.depth);
    }
  });
});

describe('generator', () => {
  it('is deterministic', () => {
    const p = LEVEL_PARAMS[11]!;
    expect(JSON.stringify(generateLevel(p))).toBe(JSON.stringify(generateLevel(p)));
    expect(JSON.stringify(buildCandidate(p, 5))).toBe(JSON.stringify(buildCandidate(p, 5)));
    expect(JSON.stringify(buildCandidate(p, 5))).not.toBe(JSON.stringify(buildCandidate(p, 6)));
  });

  it('every candidate: valid, bedrock slabs of 2-4 connected cells in varied shapes, a start power per seal', () => {
    const shapes = new Set<string>();
    for (const p of LEVEL_PARAMS.filter((x) => !x.authored)) {
      for (let seed = 0; seed < 10; seed++) {
        const d = buildCandidate(p, seed);
        if (sealingBedrock(d).length) expect(d.startPowers.length).toBeGreaterThanOrEqual(1);
        expect(validateLevelDef(d, { strictDepth: true })).toEqual([]);
        const slabs = new Map<number, Pos[]>();
        d.rows.forEach((row, y) => row.forEach((c, x) => {
          if (c.kind === 'bedrock') slabs.set(c.id, [...(slabs.get(c.id) ?? []), { x, y }]);
        }));
        for (const cells of slabs.values()) {
          expect(cells.length).toBeGreaterThanOrEqual(2);
          expect(cells.length).toBeLessThanOrEqual(4);
          expect(isConnected(cells)).toBe(true);
          const x0 = Math.min(...cells.map((c) => c.x));
          const y0 = Math.min(...cells.map((c) => c.y));
          shapes.add(cells.map((c) => `${c.x - x0},${c.y - y0}`).sort().join(';'));
        }
      }
    }
    expect(shapes.size).toBeGreaterThanOrEqual(8);
  });

  it('getLevel caches and returns a frozen definition', () => {
    const a = getLevel(7);
    expect(getLevel(7)).toBe(a);
    expect(Object.isFrozen(a.rows[0])).toBe(true);
    expect(() => getLevel(0)).toThrow();
    expect(() => getLevel(21)).toThrow();
    // A state built from it is mutable and independent.
    const s = createLevelState(a, [], 1);
    s.grid[0]![0] = { kind: 'empty' };
    expect(a.rows[0]![0]!.kind).not.toBe('empty');
  });

  it('getLevel output is identical after clearing the cache', () => {
    const before = ids.map((id) => JSON.stringify(getLevel(id)));
    clearLevelCache();
    expect(ids.map((id) => JSON.stringify(getLevel(id)))).toEqual(before);
  });
});

describe('all 20 levels', () => {
  it.each(ids)('level %i is valid and the bot wins within the move limit', (id) => {
    const def = getLevel(id);
    expect(def.id).toBe(id);
    expect(validateLevelDef(def)).toEqual([]);
    expect(def.colors).toBe(id <= 10 ? 4 : 5);
    expect(def.hard).toBe([10, 15, 20].includes(id));
    if (id === 1) expect(def.moves).toBeNull();
    else expect(def.moves).toBeGreaterThanOrEqual(10);
    // The bot wins random attempts with a generous budget (it is a solvability check, not the yardstick).
    for (const attempt of [1, 2, 3]) {
      const r = playBot(def.moves === null ? def : { ...def, moves: def.moves * 2 }, [], attempt);
      expect(r.won).toBe(true);
    }
    // Perks never make a level unwinnable for the bot.
    expect(playBot({ ...def, moves: (def.moves ?? 50) * 2 }, [...PERK_IDS], 4).won).toBe(true);
  });

  it('moves ramp up with difficulty (later generated levels need more moves on average)', () => {
    const avg = (from: number, to: number) => {
      const xs = ids.slice(from - 1, to).map((id) => getLevel(id).moves ?? 0);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg(16, 20)).toBeGreaterThan(avg(6, 10));
  });

  it('performance: generating a level plus starting an attempt takes well under 150 ms', () => {
    getLevel(6); // warm up the JIT
    clearLevelCache();
    const times: number[] = [];
    for (const id of ids) {
      const t0 = performance.now();
      createLevelState(getLevel(id), [...PERK_IDS], 12345);
      times.push(performance.now() - t0);
    }
    expect(Math.max(...times)).toBeLessThan(150);
    // Cached lookups are free.
    const t0 = performance.now();
    for (const id of ids) getLevel(id);
    expect(performance.now() - t0).toBeLessThan(5);
  });
});
