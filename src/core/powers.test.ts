import { describe, expect, it } from 'vitest';
import { armPower, disarmPower, tap } from './actions';
import { DRILL_ROWS, LIGHTNING_STRIKES, WILDFIRE_SPREAD } from './powers';
import { ascii, pw, raw } from './testkit';
import type { ActionResult, CoreEvent, GemColor, LevelState, Pos, PowerLevel } from './types';

const LEVELS: PowerLevel[] = [1, 2, 3, 4, 5];
const E = '........';
/** Checkerboard of 4 colours with no two equal orthogonal neighbours (no groups). */
const CHECK = ['rbgyrbgy', 'gyrbgyrb'];
/** `n` visible rows of checker gems, then hidden rows with a guard relic so the level never ends. */
function checker(n = 10): string[] {
  const rows = Array.from({ length: n }, (_, i) => CHECK[i % 2]!);
  return [...rows, 'rbgyrbgy', 'gyrbgyrA'];
}

function ok(r: ActionResult): CoreEvent[] {
  if (!r.ok) throw new Error(`action failed: ${r.reason}`);
  return r.events;
}
const ofType = <T extends CoreEvent['type']>(events: CoreEvent[], type: T) =>
  events.filter((e): e is Extract<CoreEvent, { type: T }> => e.type === type);
const trig = (events: CoreEvent[]) => ofType(events, 'powerTriggered')[0]!;

/** Arms a fresh power of `color`/`level` in a raw state and fires it at `at`. */
function fire(s: LevelState, color: GemColor, level: PowerLevel, at: Pos): CoreEvent[] {
  s.tray.push(pw(color, level, s.powerSeq++));
  ok(armPower(s, s.tray.length - 1));
  return ok(tap(s, at));
}
const gems = (s: LevelState, from = 0, to = 10) =>
  s.grid.slice(from, to).flat().filter((c) => c.kind === 'block').length;

describe('arming', () => {
  it('arm toggles; arming another slot moves the arm; disarm clears it; costs nothing', () => {
    const s = raw(checker(), { tray: [pw(0, 1, 0), pw(1, 2, 1)] });
    expect(ok(armPower(s, 0))).toEqual([{ type: 'powerArmed', index: 0, color: 0, level: 1 }]);
    expect(s.armed).toBe(0);
    expect(ok(armPower(s, 1))).toEqual([
      { type: 'powerDisarmed', index: 0 },
      { type: 'powerArmed', index: 1, color: 1, level: 2 },
    ]);
    expect(ok(armPower(s, 1))).toEqual([{ type: 'powerDisarmed', index: 1 }]);
    expect(s.armed).toBeNull();
    ok(armPower(s, 0));
    expect(ok(disarmPower(s))).toEqual([{ type: 'powerDisarmed', index: 0 }]);
    expect(ok(disarmPower(s))).toEqual([]);
    expect(armPower(s, 5)).toEqual({ ok: false, reason: 'no_power' });
    expect(s.movesLeft).toBe(20);
  });

  it('while armed, any visible cell can be tapped (single gem, dirt, empty); out of view is refused and stays armed', () => {
    const s = raw(['r1......', ...checker(9).slice(1)], { tray: [pw(1, 1), pw(1, 1), pw(1, 1)] });
    ok(armPower(s, 0));
    expect(tap(s, { x: 0, y: 10 })).toEqual({ ok: false, reason: 'out_of_view' });
    expect(s.armed).toBe(0);
    expect(trig(ok(tap(s, { x: 0, y: 0 }))).power).toBe('tidal'); // single gem
    ok(armPower(s, 0));
    expect(ok(tap(s, { x: 1, y: 0 })).length).toBeGreaterThan(0); // dirt
    ok(armPower(s, 0));
    expect(ok(tap(s, { x: 5, y: 0 })).length).toBeGreaterThan(0); // empty
    expect(s.tray).toHaveLength(0);
    expect(s.stats.powersUsed).toBe(3);
  });

  it('the trigger removes the power from the tray and reports its slot', () => {
    const s = raw(checker(), { tray: [pw(0, 1, 0), pw(4, 1, 1)] });
    ok(armPower(s, 1));
    const t = trig(ok(tap(s, { x: 3, y: 3 })));
    expect(t).toMatchObject({ trayIndex: 1, color: 4, power: 'drill', level: 1, at: { x: 3, y: 3 } });
    expect(s.tray.map((p) => p.color)).toEqual([0]);
    expect(s.armed).toBeNull();
  });

  it('Tempered: triggers 1 level stronger, capped at 5', () => {
    const s = raw(checker(), { perks: ['smith_tempered'] });
    expect(trig(fire(s, 4, 1, { x: 3, y: 0 })).level).toBe(2);
    expect(trig(fire(s, 4, 5, { x: 3, y: 0 })).level).toBe(5);
  });

  it('Volatile Mix: about 25% of uses leave a random Lv1 power behind', () => {
    let left = 0;
    const N = 400;
    for (let seed = 0; seed < N; seed++) {
      const s = raw(checker(), { perks: ['alch_volatile'] });
      s.rngState = seed * 7919;
      const events = fire(s, 1, 1, { x: 0, y: 9 });
      const v = ofType(events, 'powerCharged').filter((e) => e.source === 'volatile');
      if (v.length) {
        left++;
        expect(v[0]!.level).toBe(1);
        expect(s.tray).toHaveLength(1);
      }
    }
    expect(left / N).toBeGreaterThan(0.18);
    expect(left / N).toBeLessThan(0.32);
    // Without the perk: never.
    const s = raw(checker());
    expect(ofType(fire(s, 1, 1, { x: 0, y: 9 }), 'powerCharged')).toHaveLength(0);
  });
});

describe('common power rules', () => {
  it.each([0, 1, 2, 3, 4] as GemColor[])('colour %i: tapping a bedrock slab shatters the whole slab', (color) => {
    const s = raw(['XX......', '.X......', ...checker(8).slice(0, 8), 'rbgyrbgy', 'gyrbgyrA']);
    const events = fire(s, color, 1, { x: 0, y: 0 });
    expect(ofType(events, 'bedrockShattered')).toEqual([
      { type: 'bedrockShattered', id: 0, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
    ]);
    expect(s.grid.flat().some((c) => c.kind === 'bedrock')).toBe(false);
  });

  it.each([0, 1, 2, 3, 4] as GemColor[])('colour %i at Lv5 never destroys a relic directly (crust chips only)', (color) => {
    const s = raw(['rbgyrbgy', 'gyrAAbgy', 'rbgAAbgy', ...checker(7).slice(1), 'rbgyrbgy', 'gyrbgyrB']);
    s.relics[0]!.crust = 9; // survives any chips
    const events = fire(s, color, 5, { x: 3, y: 1 });
    const t = trig(events);
    const relicCells = ['3,1', '4,1', '3,2', '4,2'];
    expect(t.destroyed.filter((d) => relicCells.includes(`${d.at.x},${d.at.y}`))).toEqual([]);
    // The power only chipped it (it may be freed afterwards by the stranded-relic rule, with a crust-0 chip).
    const chip = ofType(events, 'crustChipped')[0];
    if (chip) expect(chip.crust).toBeGreaterThan(0);
  });

  it('powers only affect the visible window', () => {
    const rows = [E, E, ...checker(10).slice(0, 10), ...checker(10).slice(0, 4), 'rbgyrbgy', 'gyrbgyrA'];
    const s = raw(rows, { scroll: 2 });
    const before = ascii(s);
    const t = trig(fire(s, 1, 5, { x: 3, y: 2 })); // rows 1..3 (1 is above the view) and columns 2..4
    expect(t.effect).toEqual({ power: 'tidal', rows: [2, 3], cols: [2, 3, 4] });
    expect(t.cells.every((p) => p.y >= 2 && p.y < 12)).toBe(true);
    expect(ascii(s).slice(12)).toEqual(before.slice(12)); // rows below the view untouched
  });

  it('events: powerTriggered first, then dirt, bedrock, crust, collection; deterministic', () => {
    const rows = ['r1XX.A..', ...checker(9).slice(1), 'rbgyrbgy', 'gyrbgyrB'];
    const run = () => {
      const s = raw(rows, { perks: ['arch_softcrust'] });
      return fire(s, 1, 1, { x: 0, y: 0 });
    };
    const events = run();
    const order = events.map((e) => e.type).filter((t) => t !== 'fell' && t !== 'scrolled');
    expect(order.slice(0, 6)).toEqual(['powerTriggered', 'dirtDamaged', 'bedrockShattered', 'crustChipped', 'relicCollected', 'boonGained']);
    expect(JSON.stringify(run())).toBe(JSON.stringify(events));
  });
});

describe('Wildfire (ruby)', () => {
  it.each(LEVELS)('Lv%i burns the tapped gem plus N more gems, nearest first', (level) => {
    const s = raw(checker());
    const events = fire(s, 0, level, { x: 3, y: 4 });
    const t = trig(events);
    if (t.effect.power !== 'wildfire') throw new Error('wrong effect');
    expect(t.effect.group).toEqual([{ x: 3, y: 4 }]);
    expect(t.effect.burnt).toHaveLength(WILDFIRE_SPREAD[level - 1]!);
    const steps = t.effect.burnt.map((b) => b.step);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    for (const b of t.effect.burnt) expect(Math.abs(b.at.x - 3) + Math.abs(b.at.y - 4)).toBe(b.step);
    expect(t.destroyed).toHaveLength(1 + WILDFIRE_SPREAD[level - 1]!);
    expect(gems(s)).toBe(80 - t.destroyed.length);
  });

  it('ties at the last distance are broken by the rng (different rng, different picks)', () => {
    const picks = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const s = raw(checker());
      s.rngState = seed * 101;
      const t = trig(fire(s, 0, 1, { x: 3, y: 4 }));
      if (t.effect.power === 'wildfire') picks.add(JSON.stringify(t.effect.burnt));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('spreads through empty cells but not through dirt, relics or bedrock', () => {
    // A ruby pair in a dirt box; the only way out is the empty cell above.
    const s = raw(['bb.bb...', '1rr1....', '1111....', 'gg......', ...checker(6).slice(0, 6), 'rbgyrbgy', 'gyrbgyrA']);
    const t = trig(fire(s, 0, 1, { x: 1, y: 1 }));
    if (t.effect.power !== 'wildfire') throw new Error('wrong effect');
    expect(t.effect.group).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    // Through the empty (2,0) to the sapphires on row 0; the emeralds below the dirt are out of reach.
    expect(t.effect.burnt.map((b) => b.at).every((p) => p.y === 0)).toBe(true);
    expect(t.effect.burnt.map((b) => `${b.at.x},${b.at.y}`)).toEqual(['1,0', '0,0', '3,0']);
    expect(t.effect.burnt.map((b) => b.step)).toEqual([1, 2, 2]);
  });

  it('the tapped group is a real group clear (charges at 6+, Brilliant Cut); burnt gems never charge or pay geodes', () => {
    // 6 rubies tapped; 7 sapphires nearby get burnt (a 7-group would charge on a tap); a geode among them pays nothing.
    const s = raw(['rrrrrr..', 'bbbbbbb.', ...checker(8).slice(0, 8), 'rbgyrbgy', 'gyrbgyrA'], { geodes: [[0, 1]] });
    const events = fire(s, 0, 5, { x: 0, y: 0 });
    const charged = ofType(events, 'powerCharged');
    expect(charged).toEqual([{ type: 'powerCharged', color: 0, level: 1, index: 0, merged: false, source: 'group' }]);
    expect(ofType(events, 'geodeCleared')).toHaveLength(0);
    expect(s.stats.groups).toBe(1);
  });

  it('a geode in the tapped group pays a random Lv1 power', () => {
    const s = raw(['rr......', ...checker(9).slice(1), 'rbgyrbgy', 'gyrbgyrA'], { geodes: [[1, 0]] });
    const events = fire(s, 0, 1, { x: 0, y: 0 });
    expect(ofType(events, 'geodeCleared')).toEqual([{ type: 'geodeCleared', at: { x: 1, y: 0 }, color: 0 }]);
    expect(ofType(events, 'powerCharged')[0]).toMatchObject({ level: 1, source: 'geode' });
  });

  it('burnt and cleared cells damage adjacent dirt (+Compass), chip adjacent relics once, shatter adjacent slabs', () => {
    const s = raw(['rr2A....', 'XX......', ...checker(8).slice(0, 8), 'rbgyrbgy', 'gyrbgyrB'], { boons: { compass: 1 } });
    const events = fire(s, 0, 1, { x: 0, y: 0 });
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 2, y: 0 }, hp: 0 }]);
    expect(ofType(events, 'bedrockShattered').map((e) => e.id)).toEqual([0]);
  });

  it('tapping a non-gem starts the fire at that cell', () => {
    const s = raw(['....1...', ...checker(9).slice(1), 'rbgyrbgy', 'gyrbgyrA']);
    const events = fire(s, 0, 2, { x: 4, y: 0 });
    const t = trig(events);
    if (t.effect.power !== 'wildfire') throw new Error('wrong effect');
    expect(t.effect.group).toEqual([]);
    expect(t.effect.burnt).toHaveLength(6);
    expect(t.cells[0]).toEqual({ x: 4, y: 0 });
    // The tapped dirt touches burnt gems, so it takes adjacency damage.
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 4, y: 0 }, hp: 0 }]);
  });
});

describe('Tidal Wave (sapphire)', () => {
  const at = { x: 3, y: 4 };
  it.each<[PowerLevel, number[], number[], number]>([
    [1, [4], [], 8],
    [2, [4], [3], 17],
    [3, [3, 4, 5], [], 24],
    [4, [3, 4, 5], [3], 31],
    [5, [3, 4, 5], [2, 3, 4], 45],
  ])('Lv%i sweeps rows %j and columns %j (%i gems)', (level, rows, cols, n) => {
    const s = raw(checker());
    const t = trig(fire(s, 1, level, at));
    expect(t.effect).toEqual({ power: 'tidal', rows, cols });
    expect(t.destroyed).toHaveLength(n);
    // Wave order: outwards from the tap.
    const d = t.cells.map((p) => Math.abs(p.x - at.x) + Math.abs(p.y - at.y));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('clips "3 rows" at the top edge of the view', () => {
    const s = raw(checker());
    const t = trig(fire(s, 1, 3, { x: 0, y: 0 }));
    expect(t.effect).toEqual({ power: 'tidal', rows: [0, 1], cols: [] });
  });

  it('damages dirt in the lines by 1, chips a 2x2 relic once, shatters slabs it crosses', () => {
    const s = raw(['r2AAXX..', '..AA.X..', ...checker(8).slice(0, 8), 'rbgyrbgy', 'gyrbgyrB']);
    const events = fire(s, 1, 1, { x: 0, y: 0 });
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 1, y: 0 }, hp: 1 }]);
    expect(ofType(events, 'crustChipped')).toEqual([{ type: 'crustChipped', relicId: 0, crust: 1 }]);
    expect(ofType(events, 'bedrockShattered')[0]?.cells).toHaveLength(3);
  });
});

describe('Earthshaker (emerald)', () => {
  it.each<[PowerLevel, number, number, number]>([
    [1, 1, 2, 1],
    [2, 1, 3, 1],
    [3, 2, 3, 2],
    [4, 2, 4, 2],
    [5, 3, 5, 2],
  ])('Lv%i: Chebyshev radius %i, dirt -%i, crust -%i; gems are left alone', (level, radius, dirt, crust) => {
    // Lone emerald at (3,3); dirt 3 hp at distance (r, r) diagonally, relic just outside the radius + inside.
    const rows = Array.from({ length: 10 }, () => E);
    const set = (x: number, y: number, ch: string) => (rows[y] = rows[y]!.slice(0, x) + ch + rows[y]!.slice(x + 1));
    set(3, 3, 'g');
    set(3 + radius, 3 + radius, '3');
    set(3 + radius + 1, 3, '3'); // just outside
    set(3 - radius, 3, 'A');
    const s = raw([...rows, 'gyrbgyrb', 'rbgyrbgB']);
    s.relics[0]!.crust = 5;
    const events = fire(s, 2, level, { x: 3, y: 3 });
    const t = trig(events);
    expect(t.effect).toMatchObject({ power: 'earthshaker', radius, origin: [{ x: 3, y: 3 }] });
    expect(t.destroyed).toEqual([]);
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 3 + radius, y: 3 + radius }, hp: Math.max(0, 3 - dirt) }]);
    expect(ofType(events, 'crustChipped')[0]).toEqual({ type: 'crustChipped', relicId: 0, crust: 5 - crust });
  });

  it('shakes around the whole tapped group', () => {
    const s = raw(['gggg....', '....1...', ...checker(8).slice(0, 8), 'rbgyrbgy', 'gyrbgyrA']);
    const events = fire(s, 2, 1, { x: 0, y: 0 });
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 4, y: 1 }, hp: 0 }]);
    expect(trig(events).destroyed).toEqual([]);
  });

  it('shatters slabs in range; Ancient Key doubles crust chips', () => {
    const s = raw(['.A.X....', '...X....', ...checker(8).slice(0, 8), 'rbgyrbgy', 'gyrbgyrB'], { boons: { ancient_key: 1 } });
    s.relics[0]!.crust = 9;
    const events = fire(s, 2, 1, { x: 2, y: 0 });
    expect(ofType(events, 'bedrockShattered')).toHaveLength(1);
    expect(ofType(events, 'crustChipped')[0]).toEqual({ type: 'crustChipped', relicId: 0, crust: 7 });
  });
});

describe('Chain Lightning (topaz)', () => {
  it.each(LEVELS)('Lv%i strikes N distinct gems, the tapped gem first', (level) => {
    const s = raw(checker());
    const t = trig(fire(s, 3, level, { x: 5, y: 5 }));
    if (t.effect.power !== 'lightning') throw new Error('wrong effect');
    expect(t.effect.strikes).toHaveLength(LIGHTNING_STRIKES[level - 1]!);
    expect(t.effect.strikes[0]).toEqual({ x: 5, y: 5 });
    expect(new Set(t.effect.strikes.map((p) => `${p.x},${p.y}`)).size).toBe(t.effect.strikes.length);
    expect(t.destroyed).toHaveLength(t.effect.strikes.length);
  });

  it('is different every time (rng)', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const s = raw(checker());
      s.rngState = seed * 977;
      seen.add(JSON.stringify(trig(fire(s, 3, 2, { x: 0, y: 9 })).cells));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('each strike damages adjacent dirt (damage adds up) and chips adjacent relics per strike; fewer gems than strikes = all struck', () => {
    const rows = ['.r......', 'r3r.....', '.rA.....', ...Array<string>(7).fill(E), 'gyrbgyrb', 'rbgyrbgB'];
    const s = raw(rows);
    s.relics[0]!.crust = 9;
    const events = fire(s, 3, 3, { x: 4, y: 4 }); // 8 strikes, only 4 visible gems
    const t = trig(events);
    expect(t.destroyed).toHaveLength(4);
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 1, y: 1 }, hp: 0 }]);
    // (2,1) and (1,2) both touch the relic at (2,2): two chips.
    expect(ofType(events, 'crustChipped')[0]).toEqual({ type: 'crustChipped', relicId: 0, crust: 7 });
  });
});

describe('Drill (amethyst)', () => {
  it.each(LEVELS)('Lv%i bores down from the tapped cell (Lv5: to the bottom, 3 wide)', (level) => {
    const s = raw(checker());
    const t = trig(fire(s, 4, level, { x: 3, y: 1 }));
    const rows = Math.min(DRILL_ROWS[level - 1]!, 9);
    const cols = level === 5 ? [2, 3, 4] : [3];
    expect(t.effect).toMatchObject({ power: 'drill', cols, from: 1, to: 1 + rows - 1 });
    expect(t.destroyed).toHaveLength(rows * cols.length);
  });

  it('Lv5 at the edge is 2 wide; the path stops at the bottom of the view', () => {
    const s = raw(checker());
    const t = trig(fire(s, 4, 5, { x: 0, y: 7 }));
    expect(t.effect).toMatchObject({ cols: [0, 1], from: 7, to: 9 });
  });

  it('destroys dirt outright, chips relics by 2 (collecting a 2-crust relic), bores through bedrock', () => {
    const s = raw(['...3....', '...A....', '...X....', '...X....', '...r....', ...Array<string>(5).fill(E), 'gyrbgyrb', 'rbgyrbgB']);
    const events = fire(s, 4, 3, { x: 3, y: 0 });
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 3, y: 0 }, hp: 0 }]);
    expect(ofType(events, 'bedrockShattered')).toHaveLength(1);
    expect(ofType(events, 'crustChipped')).toEqual([{ type: 'crustChipped', relicId: 0, crust: 0 }]);
    expect(ofType(events, 'relicCollected')).toHaveLength(1);
    expect(trig(events).destroyed).toEqual([{ at: { x: 3, y: 4 }, color: 0 }]);
  });
});
