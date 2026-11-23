import { describe, expect, it } from 'vitest';
import { tap } from './actions';
import { chargeLevel, chargePower, powerThreshold } from './tray';
import { pw, raw } from './testkit';
import type { ActionResult, BoonId, CoreEvent, PerkId } from './types';

const FILL = ['ppyyppyy', 'yyppyypp'];
/** `top` rows over groupable filler, with a hidden guard relic so the level never ends. */
function board(top: string[], total = 12): string[] {
  const rows = [...top];
  while (rows.length < total) rows.push(FILL[rows.length % 2]!);
  rows[total - 1] = 'ppyyppyA';
  return rows;
}
function ok(r: ActionResult): CoreEvent[] {
  if (!r.ok) throw new Error(`action failed: ${r.reason}`);
  return r.events;
}
const charged = (events: CoreEvent[]) => events.filter((e) => e.type === 'powerCharged');
/** A row-major block of `n` rubies starting at the top-left. */
function rubies(n: number): string[] {
  const rows: string[] = [];
  for (let left = n; left > 0; left -= 8) rows.push('r'.repeat(Math.min(8, left)).padEnd(8, '.'));
  return rows;
}

describe('charge level by group size', () => {
  it.each([
    [5, null],
    [6, 1],
    [8, 1],
    [9, 2],
    [11, 2],
    [12, 3],
    [14, 3],
    [15, 4],
    [17, 4],
    [18, 5],
    [40, 5],
  ])('size %i -> level %s', (size, level) => {
    expect(chargeLevel(raw(board([])), size)).toBe(level);
  });

  it('a tap of 6+ charges a power of the group colour; 5 does not', () => {
    const s = raw(board(rubies(6)));
    expect(charged(ok(tap(s, { x: 0, y: 0 })))).toEqual([
      { type: 'powerCharged', color: 0, level: 1, index: 0, merged: false, source: 'group' },
    ]);
    expect(s.tray).toEqual([{ color: 0, level: 1, seq: 0 }]);
    const five = raw(board(rubies(5)));
    expect(charged(ok(tap(five, { x: 0, y: 0 })))).toEqual([]);
  });

  it('Crowned Ring: -1 threshold per stack (min 4); the bands shift down by the same amount', () => {
    const one = raw(board([]), { boons: { crowned_ring: 1 } });
    expect(powerThreshold(one)).toBe(5);
    expect([4, 5, 7, 8, 10, 11, 17].map((n) => chargeLevel(one, n))).toEqual([null, 1, 1, 2, 2, 3, 5]);
    const many = raw(board([]), { boons: { crowned_ring: 5 } });
    expect(powerThreshold(many)).toBe(4);
    expect([3, 4, 6, 7, 16].map((n) => chargeLevel(many, n))).toEqual([null, 1, 1, 2, 5]);
  });

  it('Chalice: +1 level per stack, capped at 5', () => {
    expect(chargeLevel(raw(board([]), { boons: { chalice: 1 } }), 6)).toBe(2);
    expect(chargeLevel(raw(board([]), { boons: { chalice: 2 } }), 9)).toBe(4);
    expect(chargeLevel(raw(board([]), { boons: { chalice: 3 } }), 18)).toBe(5);
  });

  it('Flawless: +1 level for groups of 12+ (raw size, also with a lowered threshold)', () => {
    const perks: PerkId[] = ['jeweler_flawless'];
    expect(chargeLevel(raw(board([]), { perks }), 11)).toBe(2);
    expect(chargeLevel(raw(board([]), { perks }), 12)).toBe(4);
    expect(chargeLevel(raw(board([]), { perks, boons: { chalice: 1 } }), 18)).toBe(5);
  });
});

describe('tray', () => {
  it('merges a same-colour charge: max(old, new) + 1, capped at 5, in place', () => {
    const s = raw(board([]), { tray: [pw(1, 1, 0), pw(0, 2, 1)] });
    const events: CoreEvent[] = [];
    chargePower(s, 0, 1, 'group', events);
    expect(events).toEqual([{ type: 'powerCharged', color: 0, level: 3, index: 1, merged: true, source: 'group' }]);
    chargePower(s, 0, 4, 'group', events);
    expect(s.tray[1]).toEqual({ color: 0, level: 5, seq: 1 });
    chargePower(s, 0, 5, 'group', events);
    expect(s.tray[1]!.level).toBe(5);
    expect(s.tray).toHaveLength(2);
  });

  it('holds 3; a new colour on a full tray replaces the lowest level (tie: oldest) in its slot', () => {
    const s = raw(board([]), { tray: [pw(0, 2, 0), pw(1, 1, 1), pw(2, 1, 2)] });
    const events: CoreEvent[] = [];
    chargePower(s, 3, 1, 'group', events);
    expect(events[0]).toEqual({
      type: 'powerCharged', color: 3, level: 1, index: 1, merged: false, source: 'group', replaced: { color: 1, level: 1 },
    });
    expect(s.tray.map((p) => p.color)).toEqual([0, 3, 2]);
    // Now emerald (seq 2) is the oldest Lv1.
    chargePower(s, 4, 3, 'group', events);
    expect(s.tray.map((p) => p.color)).toEqual([0, 3, 4]);
    expect(events[1]).toMatchObject({ index: 2, replaced: { color: 2, level: 1 } });
  });

  it('a full tray of higher-level powers skips the new power instead of replacing one', () => {
    const s = raw(board([]), { tray: [pw(0, 2, 0), pw(1, 3, 1), pw(2, 2, 2)] });
    const events: CoreEvent[] = [];
    chargePower(s, 3, 1, 'geode', events);
    expect(events).toEqual([{ type: 'powerSkipped', color: 3, level: 1, source: 'geode' }]);
    expect(s.tray).toEqual([pw(0, 2, 0), pw(1, 3, 1), pw(2, 2, 2)]);
    expect(s.stats.powersCharged).toBe(0);
    // An equal level still replaces (the oldest Lv2).
    chargePower(s, 3, 2, 'group', events);
    expect(s.tray.map((p) => p.color)).toEqual([3, 1, 2]);
    expect(events[1]).toMatchObject({ type: 'powerCharged', index: 0, replaced: { color: 0, level: 2 } });
    // Same colour always merges, even into a full tray.
    chargePower(s, 1, 1, 'group', events);
    expect(s.tray[1]!.level).toBe(4);
  });

  it('Tool Belt: holds 4', () => {
    const s = raw(board([]), { perks: ['smith_toolbelt'], tray: [pw(0, 1, 0), pw(1, 1, 1), pw(2, 1, 2)] });
    chargePower(s, 3, 1, 'group', []);
    expect(s.tray).toHaveLength(4);
    chargePower(s, 4, 1, 'group', []);
    expect(s.tray).toHaveLength(4);
    expect(s.tray.map((p) => p.color)).toEqual([4, 1, 2, 3]);
  });

  it('a geode in a tapped group grants a random Lv1 power after the group charge', () => {
    const s = raw(board(rubies(6)), { geodes: [[2, 0]] });
    const events = ok(tap(s, { x: 0, y: 0 }));
    const types = events.map((e) => e.type);
    expect(types.indexOf('powerCharged')).toBeLessThan(types.indexOf('geodeCleared'));
    expect(events.find((e) => e.type === 'cleared')).toMatchObject({ geodes: [{ x: 2, y: 0 }] });
    expect(charged(events).map((e) => (e.type === 'powerCharged' ? e.source : ''))).toEqual(['group', 'geode']);
    expect(s.stats.geodes).toBe(1);
  });

  it('Brilliant Cut: a clear of 10+ gives +1 move before the power is charged', () => {
    const s = raw(board(rubies(10)), { perks: ['jeweler_brilliant'] });
    const types = ok(tap(s, { x: 0, y: 0 })).map((e) => e.type);
    expect(types.indexOf('bonusMove')).toBeLessThan(types.indexOf('powerCharged'));
    expect(s.movesLeft).toBe(20);
  });
});

describe('reforge token: first 20+ group', () => {
  it('rolls once per attempt at 40%', () => {
    let got = 0;
    for (let seed = 0; seed < 300; seed++) {
      const s = raw(board([...rubies(20), 'bbbbbbbb', 'bbbbbbbb', 'bbbbbbbb']));
      s.rngState = seed * 31337;
      const events = ok(tap(s, { x: 0, y: 0 }));
      const tokens = events.filter((e) => e.type === 'reforgeTokenEarned');
      got += tokens.length;
      expect(s.stats.bigGroupRolled).toBe(true);
      // A second 20+ group never rolls again.
      let at = { x: 0, y: 0 };
      s.grid.forEach((row, y) => row.forEach((c, x) => {
        if (c.kind === 'block' && c.color === 1 && y >= s.scroll) at = { x, y };
      }));
      const again = ok(tap(s, at)).filter((e) => e.type === 'reforgeTokenEarned' && e.reason === 'big_group');
      expect(again).toHaveLength(0);
      expect(s.stats.reforgeTokens).toBe(tokens.length);
    }
    expect(got / 300).toBeGreaterThan(0.32);
    expect(got / 300).toBeLessThan(0.48);
  });
});

describe('boons in the charge path', () => {
  it.each<[BoonId, number]>([
    ['chalice', 2],
    ['crowned_ring', 1],
    ['compass', 1],
  ])('%s with a 6-group', (boon, level) => {
    const s = raw(board(rubies(6)), { boons: { [boon]: 1 } });
    expect(charged(ok(tap(s, { x: 0, y: 0 })))[0]).toMatchObject({ level });
  });
});
