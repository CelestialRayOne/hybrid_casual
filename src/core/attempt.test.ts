import { describe, expect, it } from 'vitest';
import { BONUS_MIN_ROW, bonusRelicSpots } from './attempt';
import { relicNeighbours } from './board';
import { LEVEL_COUNT, getLevel } from './generator';
import { createLevelState } from './level';
import { AUTHORED_LEVELS } from './levels';
import { BOON_IDS, COLUMNS } from './types';
import type { LevelState } from './types';

const colours = (s: LevelState) => s.grid.map((r) => r.map((c) => (c.kind === 'block' ? c.color : '-')).join('')).join('|');

describe('per-attempt randomness', () => {
  it('is deterministic for (def, perks, attemptSeed) and differs between seeds', () => {
    const def = getLevel(12);
    const a = createLevelState(def, [], 42);
    const b = createLevelState(def, [], 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = createLevelState(def, [], 43);
    expect(colours(c)).not.toBe(colours(a));
    expect(a.attemptSeed).toBe(42);
  });

  it('keeps the structure: dirt, bedrock and goal relics are identical across attempts', () => {
    const def = getLevel(15);
    const fixed = (s: LevelState) =>
      s.grid.map((r) => r.map((c) => (c.kind === 'dirt' ? `d${c.hp}` : c.kind === 'bedrock' ? `x${c.id}` : '.')).join('')).join('|');
    const goal = (s: LevelState) => JSON.stringify(s.relics.filter((r) => !r.bonus).map((r) => [r.id, r.x, r.y, r.size]));
    const s1 = createLevelState(def, [], 1);
    for (const seed of [2, 3, 99, 123456]) {
      const s = createLevelState(def, [], seed);
      expect(goal(s)).toBe(goal(s1));
      expect(s.goal).toBe(def.relics.length);
      expect(s.movesLeft).toBe(def.moves);
    }
    // Dirt and bedrock are the same on every attempt (bonus relics only replace gems).
    const noBonus = { ...def, bonusRelics: [0, 0] as const };
    const shapes = new Set([1, 2, 3, 4].map((seed) => fixed(createLevelState(noBonus, [], seed))));
    expect(shapes.size).toBe(1);
  });

  it('uses only the level colours and keeps pinned tutorial cells', () => {
    const l2 = AUTHORED_LEVELS[1]!;
    expect(l2.pinned.length).toBeGreaterThanOrEqual(7);
    for (let seed = 1; seed <= 20; seed++) {
      const s = createLevelState(l2, [], seed);
      for (const p of l2.pinned) {
        const want = l2.rows[p.y]![p.x]!;
        // Pinned rows sit in the first view, so nothing has fallen yet.
        expect(s.grid[p.y]![p.x]).toEqual(want);
      }
      expect(s.grid.flat().every((c) => c.kind !== 'block' || c.color < l2.colors)).toBe(true);
    }
  });

  it('L2: the scripted 7-sapphire group is there on every attempt', () => {
    const l2 = AUTHORED_LEVELS[1]!;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createLevelState(l2, [], seed);
      const sapphires: [number, number][] = [[3, 0], [4, 0], [5, 0], [2, 1], [3, 1], [4, 1], [5, 1]];
      for (const [x, y] of sapphires) expect(s.grid[y]![x]).toMatchObject({ kind: 'block', color: 1 });
    }
  });

  it('geodes appear at about the level rate, never on pinned cells', () => {
    const def = getLevel(10); // boss: higher rate
    let gems = 0;
    let geodes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = createLevelState(def, [], seed);
      for (const c of s.grid.flat()) {
        if (c.kind !== 'block') continue;
        gems++;
        if (c.geode) geodes++;
      }
    }
    expect(geodes / gems).toBeGreaterThan(def.geodeRate * 0.6);
    expect(geodes / gems).toBeLessThan(def.geodeRate * 1.4);
    const l1 = createLevelState(AUTHORED_LEVELS[0]!, [], 3);
    expect(l1.grid.flat().some((c) => c.kind === 'block' && c.geode)).toBe(false);
  });

  it('relic types are rolled per attempt over all 6 boons', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const r of createLevelState(getLevel(12), [], seed).relics) seen.add(r.boon);
    expect([...seen].sort()).toEqual([...BOON_IDS].sort());
    const r = createLevelState(getLevel(12), [], 5).relics[0]!;
    expect(BOON_IDS[r.variant]).toBe(r.boon);
  });
});

describe('bonus relics', () => {
  it.each(Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1))('level %i: count in range and placed validly', (id) => {
    const def = getLevel(id);
    const firstGoal = Math.min(...def.relics.map((r) => r.y));
    for (let seed = 1; seed <= 15; seed++) {
      const s = createLevelState(def, [], seed);
      const bonus = s.relics.filter((r) => r.bonus);
      expect(bonus.length).toBeLessThanOrEqual(def.bonusRelics[1]);
      for (const r of bonus) {
        expect(r.y).toBeGreaterThanOrEqual(Math.max(BONUS_MIN_ROW, firstGoal - 1));
        // Never on a pinned cell, never next to another relic or a slab.
        for (const o of s.relics) {
          if (o.id === r.id) continue;
          const gap = Math.max(
            Math.max(0, Math.max(o.x, r.x) - Math.min(o.x + o.size - 1, r.x + r.size - 1)),
            Math.max(0, Math.max(o.y, r.y) - Math.min(o.y + o.size - 1, r.y + r.size - 1)),
          );
          expect(gap).toBeGreaterThan(2);
        }
        const fixedNeighbours = relicNeighbours(r).filter((n) => {
          const c = def.rows[n.y]?.[n.x];
          return c !== undefined && c.kind !== 'block' && c.kind !== 'empty';
        });
        expect(fixedNeighbours.every((n) => def.rows[n.y]![n.x]!.kind === 'dirt')).toBe(true);
        expect(fixedNeighbours.length).toBeLessThanOrEqual(1);
      }
      // Ids are unique.
      expect(new Set(s.relics.map((r) => r.id)).size).toBe(s.relics.length);
    }
  });

  it('boss levels roll many bonus relics; Treasure Sense adds one', () => {
    for (const id of [5, 10, 15, 20]) {
      const def = getLevel(id);
      expect(def.boss).toBe(true);
      const counts = [1, 2, 3, 4, 5, 6].map((seed) => createLevelState(def, [], seed).relics.filter((r) => r.bonus).length);
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
      const more = [1, 2, 3, 4, 5, 6].map((seed) => createLevelState(def, ['arch_treasure'], seed).relics.filter((r) => r.bonus).length);
      expect(more.reduce((a, b) => a + b, 0)).toBeGreaterThan(counts.reduce((a, b) => a + b, 0));
    }
  });

  it('spots respect pinned cells and need 2+ gem neighbours', () => {
    const s = createLevelState(AUTHORED_LEVELS[1]!, [], 1);
    const pinned = new Set(AUTHORED_LEVELS[1]!.pinned.map((p) => p.y * COLUMNS + p.x));
    for (const p of bonusRelicSpots(s, 1)) {
      expect(pinned.has(p.y * COLUMNS + p.x)).toBe(false);
      const gems = relicNeighbours({ ...p, size: 1 }).filter((n) => s.grid[n.y]?.[n.x]?.kind === 'block').length;
      expect(gems).toBeGreaterThanOrEqual(2);
    }
  });
});
