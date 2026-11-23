import { describe, expect, it } from 'vitest';
import { armPower, tap } from './actions';
import { playBot, playCasual } from './bot';
import { listGroups } from './board';
import { LEVEL_MOVES } from './levelTable';
import { createLevelState, sealingBedrock, validateLevelDef } from './level';
import { AUTHORED_LEVELS, parseAsciiLevel } from './levels';
import { Rng } from './rng';
import { VISIBLE_ROWS } from './types';
import type { LevelDef } from './types';

const L = (id: number) => AUTHORED_LEVELS.find((l) => l.id === id) as LevelDef;
const count = (def: LevelDef, kind: string) => def.rows.flat().filter((c) => c.kind === kind).length;

describe('authored levels 1-5', () => {
  it('are structurally valid', () => {
    expect(AUTHORED_LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]);
    for (const def of AUTHORED_LEVELS) expect(validateLevelDef(def)).toEqual([]);
  });

  it('level 1 teaches tapping: no move limit, one relic just below the first view, a pinned 5-topaz group', () => {
    const d = L(1);
    expect(d.moves).toBeNull();
    expect(d.tutorial).toEqual(['tap']);
    expect(d.relics).toHaveLength(1);
    expect(d.relics[0]!.y).toBe(VISIBLE_ROWS);
    expect(count(d, 'dirt') + count(d, 'bedrock')).toBe(0);
    expect(d.bonusRelics).toEqual([0, 0]);
    expect(d.geodeRate).toBe(0);
    for (let seed = 1; seed <= 10; seed++) {
      const s = createLevelState(d, [], seed);
      expect(s.scroll).toBe(0);
      const topaz = listGroups(s).find((g) => g.some((p) => p.x === 1 && p.y === 2))!;
      expect(topaz).toHaveLength(5);
    }
    const bot = playBot(d, [], 1);
    expect(bot.won).toBe(true);
    expect(bot.maxDepth).toBeGreaterThanOrEqual(1);
  });

  it('level 1 cannot be lost: random tapping always wins, on any attempt', () => {
    for (let seed = 0; seed < 25; seed++) {
      const rng = new Rng(seed);
      const s = createLevelState(L(1), [], seed);
      for (let n = 0; n < 400 && s.status === 'playing'; n++) {
        if (s.armed === null && s.tray.length && rng.chance(0.3)) armPower(s, 0);
        if (s.armed !== null) {
          tap(s, { x: rng.int(8), y: s.scroll + rng.int(VISIBLE_ROWS) });
          continue;
        }
        const groups = listGroups(s);
        if (groups.length === 0) {
          if (s.tray.length) armPower(s, 0);
          continue;
        }
        tap(s, rng.pick(rng.pick(groups)));
      }
      expect(s.status).toBe('won');
    }
  });

  it('level 2 introduces dirt and the first power: the pinned 7-sapphire group charges a Tidal Wave', () => {
    const d = L(2);
    expect(d.tutorial).toEqual(['dirt', 'charge']);
    expect(count(d, 'dirt')).toBeGreaterThan(5);
    expect(count(d, 'bedrock')).toBe(0);
    for (let seed = 1; seed <= 10; seed++) {
      const s = createLevelState(d, [], seed);
      const res = tap(s, { x: 3, y: 0 });
      expect(res.ok && res.events.find((e) => e.type === 'cleared')).toMatchObject({ size: 7, color: 1 });
      expect(res.ok && res.events.find((e) => e.type === 'powerCharged')).toMatchObject({ color: 1, level: 1, source: 'group' });
    }
  });

  it('level 3 starts with a power to use', () => {
    const d = L(3);
    expect(d.tutorial).toEqual(['use']);
    expect(createLevelState(d, [], 1).tray).toEqual([{ color: 4, level: 2, seq: 0 }]);
  });

  it('level 5 (onboarding boss) introduces bedrock that seals a relic, with a free power', () => {
    const d = L(5);
    expect(d.tutorial).toEqual(['bedrock']);
    expect(d.boss).toBe(true);
    expect(d.hard).toBe(false);
    expect(sealingBedrock(d)).toHaveLength(1);
    const s = createLevelState(d, [], 1);
    expect(s.tray).toHaveLength(1);
    // Once the slab is in view, the free power tapped on it shatters it.
    s.scroll = 8;
    armPower(s, 0);
    const res = tap(s, { x: 3, y: 14 });
    expect(res.ok && res.events.find((e) => e.type === 'bedrockShattered')).toMatchObject({ id: 0 });
  });

  it('every goal relic starts below row 3 and no attempt starts won', () => {
    for (const def of AUTHORED_LEVELS) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = createLevelState(def, [], seed);
        expect(s.status).toBe('playing');
        expect(s.relics.every((r) => !r.collected)).toBe(true);
      }
      expect(def.relics.every((r) => r.y >= 3 && r.y < def.rows.length)).toBe(true);
      expect(def.rows.length).toBeGreaterThanOrEqual(VISIBLE_ROWS * 2);
    }
  });

  it.each([2, 3, 4, 5])('level %i: calibrated moves; casual play nearly always wins over random attempts', (id) => {
    const d = L(id);
    expect(d.moves).toBe(LEVEL_MOVES[id - 1]);
    // Quick spot check of the ~92% onboarding target (the full check is the TUNING=1 report).
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) if (playCasual(d, [], seed, seed).won) wins++;
    expect(wins).toBeGreaterThanOrEqual(16);
  });

  it('parseAsciiLevel: o = random gem, letters = pinned; rejects bad input', () => {
    const d = parseAsciiLevel({ id: 1, seed: 1, colors: 4, moves: 1, rows: ['ooyo.1AX', 'oooooooX'] });
    expect(d.pinned).toEqual([{ x: 2, y: 0 }]);
    expect(d.relics).toEqual([{ id: 0, x: 6, y: 0, size: 1 }]);
    expect(() => parseAsciiLevel({ id: 1, seed: 1, colors: 4, moves: 1, rows: ['rrr'] })).toThrow(/8 cells/);
    expect(() => parseAsciiLevel({ id: 1, seed: 1, colors: 4, moves: 1, rows: ['rrrrrrr?'] })).toThrow(/unknown/);
  });
});
