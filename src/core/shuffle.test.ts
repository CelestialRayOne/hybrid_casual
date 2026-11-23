import { describe, expect, it } from 'vitest';
import { tap } from './actions';
import { hasAnyGroup, listGroups, visibleBlocks } from './board';
import { Rng } from './rng';
import { countGroupsIn, resolveDeadBoard } from './shuffle';
import { ascii, pw, raw } from './testkit';
import type { CoreEvent, GemColor, LevelState } from './types';

const E = '........';
/**
 * Rows on top of empty space, with a guard relic near the bottom (keeps the level going). A live
 * gem (resting on another gem) under the guard keeps it from counting as stranded.
 */
const rowsOf = (top: string[]) => {
  const rows = [...top];
  while (rows.length < 11) rows.push(E);
  rows.push('A.......', 'g.......', 'r.......');
  return rows;
};
const colours = (s: LevelState) =>
  visibleBlocks(s)
    .map((p) => (s.grid[p.y]![p.x] as { color: GemColor }).color)
    .sort();

describe('dead board', () => {
  it('shuffles visible colours (same multiset), aiming for 3+ groups', () => {
    const s = raw(rowsOf(['rbgyrbgy', 'bgyrbgyr', 'gyrbgyrb', 'yrbgyrbg', 'rbgyrbgy']));
    expect(hasAnyGroup(s)).toBe(false);
    const before = colours(s);
    const events: CoreEvent[] = [];
    resolveDeadBoard(s, events);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.type).toBe('shuffled');
    if (e.type === 'shuffled') expect(e.cells).toHaveLength(40);
    expect(colours(s)).toEqual(before);
    expect(listGroups(s).length).toBeGreaterThanOrEqual(3);
  });

  it('does nothing while a group exists, a power is in the tray, or the level is over', () => {
    const withGroup = raw(rowsOf(['rrb.....']));
    const events: CoreEvent[] = [];
    resolveDeadBoard(withGroup, events);
    const withPower = raw(rowsOf(['rb......']), { tray: [pw(0, 1)] });
    resolveDeadBoard(withPower, events);
    const over = raw(rowsOf(['rb......']));
    over.status = 'lost';
    resolveDeadBoard(over, events);
    expect(events).toEqual([]);
  });

  it.each([
    ['two different neighbours: recolour exactly one', ['rb......'], 1],
    ['three in a row, two share a colour: pure shuffle', ['rbr.....'], 0],
    ['all colours different in an L: recolour one', ['rb......', 'g.......'], 1],
  ])('tiny board, %s', (_name, top, recoloured) => {
    const s = raw(rowsOf(top));
    const before = colours(s);
    resolveDeadBoard(s, []);
    expect(hasAnyGroup(s)).toBe(true);
    const after = colours(s);
    const diff = before.filter((c, i) => c !== after[i]).length;
    expect(diff).toBeLessThanOrEqual(recoloured);
    if (recoloured === 0) expect(after).toEqual(before);
  });

  it('with no two visible blocks adjacent, grants a rescue power (Drill Lv1) instead', () => {
    const s = raw(rowsOf(['r.b.g...']));
    const events: CoreEvent[] = [];
    resolveDeadBoard(s, events);
    expect(events).toEqual([{ type: 'powerCharged', color: 4, level: 1, index: 0, merged: false, source: 'rescue' }]);
    expect(s.tray).toEqual([{ color: 4, level: 1, seq: 0 }]);
    expect(s.stats.rescues).toBe(1);
    expect(ascii(s, 0, 1)).toEqual(['r.b.g...']);
  });

  it('runs at the end of an action, after the end check', () => {
    // After clearing the rubies, the remaining blocks have no group.
    const s = raw(rowsOf(['bgby....', 'rrrr....']));
    const res = tap(s, { x: 0, y: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events.at(-1)?.type).toBe('shuffled');
    expect(hasAnyGroup(s)).toBe(true);
  });

  it('always leaves at least one group on random dead boards (property test)', () => {
    const rng = new Rng(2024);
    for (let n = 0; n < 200; n++) {
      // Random sparse board without groups: drop random colours, skip any that would form a pair.
      const rows: string[] = [];
      const grid: (string | null)[][] = [];
      for (let y = 0; y < 10; y++) {
        const row: (string | null)[] = [];
        for (let x = 0; x < 8; x++) {
          if (!rng.chance(0.6)) {
            row.push(null);
            continue;
          }
          const c = 'rbgyp'[rng.int(1 + rng.int(5))]!;
          const clash = row[x - 1] === c || grid[y - 1]?.[x] === c;
          row.push(clash ? null : c);
        }
        grid.push(row);
        rows.push(row.map((c) => c ?? '.').join(''));
      }
      const s = raw([...rows, E, 'A.......']);
      s.rngState = n;
      if (hasAnyGroup(s)) continue;
      const events: CoreEvent[] = [];
      resolveDeadBoard(s, events);
      const rescued = events.some((e) => e.type === 'powerCharged' && e.source === 'rescue');
      expect(rescued || hasAnyGroup(s)).toBe(true);
    }
  });

  it('is deterministic for the same rng state', () => {
    const a = raw(rowsOf(['rbgyrbgy', 'bgyrbgyr']));
    const b = raw(rowsOf(['rbgyrbgy', 'bgyrbgyr']));
    const ea: CoreEvent[] = [];
    const eb: CoreEvent[] = [];
    resolveDeadBoard(a, ea);
    resolveDeadBoard(b, eb);
    expect(ea).toEqual(eb);
    expect(a.rngState).toBe(b.rngState);
  });

  it('keeps geode flags in place while colours move', () => {
    const s = raw(rowsOf(['rbgyrbgy', 'bgyrbgyr']), { geodes: [[2, 0]] });
    resolveDeadBoard(s, []);
    expect(s.grid[0]![2]).toMatchObject({ kind: 'block', geode: true });
    expect(s.grid.flat().filter((c) => c.kind === 'block' && c.geode)).toHaveLength(1);
  });

  it('a sealed relic (unreachable by clears, touching bedrock) with an empty tray grants a rescue power', () => {
    // Relic boxed in by a slab above/right and dirt below; gems elsewhere still form groups.
    const s = raw(['XX......', 'AX......', '3.......', '....rr..', '....bb..', ...Array<string>(7).fill(E)]);
    const events: CoreEvent[] = [];
    resolveDeadBoard(s, events);
    expect(events).toEqual([{ type: 'powerCharged', color: 4, level: 1, index: 0, merged: false, source: 'rescue' }]);
    // Not again while the tray holds it.
    resolveDeadBoard(s, events);
    expect(events).toHaveLength(1);
  });

  it('countGroupsIn does not wrap between rows', () => {
    const cells = [{ x: 7, y: 0 }, { x: 0, y: 1 }];
    expect(countGroupsIn(cells, [1, 1])).toBe(0);
    expect(countGroupsIn([{ x: 0, y: 0 }, { x: 1, y: 0 }], [2, 2])).toBe(1);
  });
});
