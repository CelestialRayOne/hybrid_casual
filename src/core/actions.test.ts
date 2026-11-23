import { describe, expect, it } from 'vitest';
import { armPower, levelResult, stars, tap, transmute, useContinue } from './actions';
import { createLevelState } from './level';
import { ascii, def, pw, raw } from './testkit';
import type { ActionResult, CoreEvent, LevelState, PerkId } from './types';

/** Test rows on top of groupable filler (topaz/amethyst pairs), with a guard relic B bottom-right. */
function board(top: string[], total = 12): string[] {
  const rows = [...top];
  while (rows.length < total) rows.push(rows.length % 2 ? 'ppyyppyy' : 'yyppyypp');
  rows[total - 1] = 'ppyyppyB';
  return rows;
}

function ok(r: ActionResult): CoreEvent[] {
  if (!r.ok) throw new Error(`action failed: ${r.reason}`);
  return r.events;
}
const ofType = <T extends CoreEvent['type']>(events: CoreEvent[], type: T) =>
  events.filter((e): e is Extract<CoreEvent, { type: T }> => e.type === type);

describe('tap', () => {
  it('rejects single blocks, empty cells and cells out of view without side effects', () => {
    const s = raw(board(['rb......', 'gg......']));
    const before = JSON.stringify(s);
    expect(tap(s, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'not_a_group' });
    expect(tap(s, { x: 5, y: 0 })).toEqual({ ok: false, reason: 'not_a_group' });
    expect(tap(s, { x: 0, y: 10 })).toEqual({ ok: false, reason: 'out_of_view' });
    expect(tap(s, { x: 8, y: 0 })).toEqual({ ok: false, reason: 'out_of_view' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('clears the group, costs 1 move, and lets blocks above fall', () => {
    const s = raw(board(['r.......', 'gg......']));
    const events = ok(tap(s, { x: 1, y: 1 }));
    expect(events[0]).toEqual({ type: 'cleared', cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], color: 2, size: 2 });
    expect(ofType(events, 'fell')[0]?.moves).toEqual([{ from: { x: 0, y: 0 }, to: { x: 0, y: 1 } }]);
    expect(ascii(s, 0, 2)).toEqual(['........', 'r.......']);
    expect(s.movesLeft).toBe(19);
    expect(s.movesUsed).toBe(1);
  });

  it('rejects group taps when no moves are left but a power keeps the level alive', () => {
    const s = raw(board(['rr......']), { tray: [pw(1, 1)] });
    s.movesLeft = 0;
    expect(tap(s, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'no_moves' });
  });

  it('rejects actions once the level is over', () => {
    const s = raw(board(['rr......']));
    s.status = 'won';
    expect(tap(s, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'not_playing' });
    expect(armPower(s, 0)).toEqual({ ok: false, reason: 'not_playing' });
  });
});

describe('dirt', () => {
  it('takes 1 damage per clear even when several cleared cells touch it', () => {
    const s = raw(board(['rr2.....', 'rr2.....', '..3.....']));
    const events = ok(tap(s, { x: 0, y: 0 }));
    expect(ofType(events, 'dirtDamaged')).toEqual([
      { type: 'dirtDamaged', at: { x: 2, y: 0 }, hp: 1 },
      { type: 'dirtDamaged', at: { x: 2, y: 1 }, hp: 1 },
    ]);
    // (2,2) is only diagonal to the group: untouched.
    expect(ascii(s, 0, 3).map((r) => r.slice(2, 3))).toEqual(['1', '1', '3']);
  });

  it('disappears at 0 hp and lets blocks above fall through', () => {
    const s = raw(board(['.g......', 'r1......', 'rr......']));
    const events = ok(tap(s, { x: 0, y: 2 }));
    expect(ofType(events, 'dirtDamaged')).toEqual([{ type: 'dirtDamaged', at: { x: 1, y: 1 }, hp: 0 }]);
    expect(ascii(s, 0, 3)).toEqual(['........', '........', '.g......']);
  });

  it('Compass boon: group clears deal +1 damage per stack to adjacent dirt', () => {
    const s = raw(board(['rr3.....']), { boons: { compass: 1 } });
    expect(ofType(ok(tap(s, { x: 0, y: 0 })), 'dirtDamaged')[0]?.hp).toBe(1);
    const t = raw(board(['rr3.....']), { boons: { compass: 2 } });
    expect(ofType(ok(tap(t, { x: 0, y: 0 })), 'dirtDamaged')[0]?.hp).toBe(0);
  });

  it('group clears never affect bedrock', () => {
    const s = raw(board(['rrXX....']));
    const events = ok(tap(s, { x: 0, y: 0 }));
    expect(ofType(events, 'bedrockShattered')).toHaveLength(0);
    expect(ascii(s, 0, 1)[0]).toBe('..XX....');
  });
});

describe('relic crust', () => {
  it('is chipped at most once per clear and collected at 0', () => {
    const s = raw(board(['bgyyy...', 'rrAgg...', 'rrrgg...', 'bbbbb...']));
    expect(s.relics[0]?.crust).toBe(2);
    const first = ok(tap(s, { x: 0, y: 1 })); // touches the relic from the left and from below
    expect(ofType(first, 'crustChipped')).toEqual([{ type: 'crustChipped', relicId: 0, crust: 1 }]);
    expect(s.relics[0]?.collected).toBe(false);
    const second = ok(tap(s, { x: 3, y: 0 })); // the topaz row resting on top of it
    expect(ofType(second, 'crustChipped')).toEqual([{ type: 'crustChipped', relicId: 0, crust: 0 }]);
    expect(ofType(second, 'relicCollected')).toEqual([
      { type: 'relicCollected', relicId: 0, boon: 'compass', bonus: false, collected: 1, goal: 2 },
    ]);
    expect(s.relics[0]?.collected).toBe(true);
  });

  it('a 2x2 relic loses one crust per clear even when the group touches several of its cells', () => {
    const s = raw(board(['ggyy....', 'rrAA....', 'rrAA....', 'rrbb....']));
    const events = ok(tap(s, { x: 0, y: 1 }));
    expect(ofType(events, 'crustChipped')).toHaveLength(1);
    expect(s.relics[0]?.crust).toBe(1);
    expect(ascii(s, 0, 4)).toEqual(['..yy....', '..AA....', '..AA....', 'ggbb....']);
  });

  it('arch_softcrust: one adjacent clear collects', () => {
    const s = raw(board(['rrA.....', 'g.......']), { perks: ['arch_softcrust'] });
    expect(s.relics[0]?.crust).toBe(1);
    ok(tap(s, { x: 0, y: 0 }));
    expect(s.relics[0]?.collected).toBe(true);
  });

  it('a relic that no block can ever touch again breaks free (stranded relic rule)', () => {
    // After the rubies go, nothing is left next to or above the relic.
    const s = raw(['..rA....', '...r....', '...r....', '...1....', ...board([], 9)].slice(0, 12));
    s.grid[0]![2] = { kind: 'empty' };
    const events = ok(tap(s, { x: 3, y: 1 }));
    expect(s.relics[0]?.collected).toBe(true);
    // One chip from the adjacent clear, then the rule frees it.
    expect(ofType(events, 'crustChipped').map((e) => e.crust)).toEqual([1, 0]);
    expect(ofType(events, 'relicCollected')).toHaveLength(1);
  });
});

describe('win and lose', () => {
  it('win is checked before lose (last move collects the last relic)', () => {
    const filler = Array.from({ length: 10 }, (_, i) => (i % 2 ? 'ppyyppyy' : 'yyppyypp'));
    const s = raw(['rrA.....', 'gggb....', ...filler], { moves: 1, perks: ['arch_softcrust'] });
    const events = ok(tap(s, { x: 0, y: 0 }));
    expect(s.movesLeft).toBe(0);
    expect(s.status).toBe('won');
    expect(ofType(events, 'won')).toHaveLength(1);
    expect(ofType(events, 'lost')).toHaveLength(0);
  });

  it('0 moves with an empty tray loses; a power in the tray keeps it alive, and its trigger is free (last chance)', () => {
    const lose = raw(board(['rr......']), { moves: 1 });
    expect(ofType(ok(tap(lose, { x: 0, y: 0 })), 'lost')).toHaveLength(1);
    expect(lose.status).toBe('lost');

    const alive = raw(board(['rr......']), { moves: 1, tray: [pw(1, 1)] });
    ok(tap(alive, { x: 0, y: 0 }));
    expect(alive.status).toBe('playing');
    expect(alive.movesLeft).toBe(0);
    ok(armPower(alive, 0));
    const last = ok(tap(alive, { x: 3, y: 5 }));
    expect(ofType(last, 'powerTriggered')).toHaveLength(1);
    expect(alive.movesLeft).toBe(0);
    expect(alive.movesUsed).toBe(1); // the free trigger did not count as a move
    expect(alive.status).toBe('lost');
    expect(ofType(last, 'lost')).toHaveLength(1);
  });

  it('a triggered power costs 1 move while moves are left', () => {
    const s = raw(board(['rr......']), { moves: 5, tray: [pw(1, 1)] });
    ok(armPower(s, 0));
    ok(tap(s, { x: 3, y: 5 }));
    expect(s.movesLeft).toBe(4);
    expect(s.movesUsed).toBe(1);
  });

  it('any relic counts towards the goal: a bonus relic can complete it', () => {
    const filler = Array.from({ length: 10 }, (_, i) => (i % 2 ? 'ppyyppyy' : 'yyppyypp'));
    const s = raw(['rrA.....', 'gggb....', ...filler.slice(0, 9), 'ppyyppyB'], { perks: ['arch_softcrust'], bonus: [0] });
    expect(s.goal).toBe(1);
    const events = ok(tap(s, { x: 0, y: 0 }));
    expect(ofType(events, 'relicCollected')[0]).toMatchObject({ relicId: 0, bonus: true, collected: 1, goal: 1 });
    expect(s.status).toBe('won');
    expect(levelResult(s)).toMatchObject({ status: 'won', collected: 1, goal: 1, bonusCollected: 1 });
  });

  it('unlimited levels never lose on moves', () => {
    const s = raw(board(['rr......', 'gg......']), { moves: null });
    ok(tap(s, { x: 0, y: 0 }));
    expect(s.movesLeft).toBeNull();
    expect(s.movesUsed).toBe(1);
    expect(s.status).toBe('playing');
  });
});

describe('continue', () => {
  it('+5 moves once, lost -> playing, caps stars at 1', () => {
    const s = raw(board(['rr......', 'gg......', 'bb......']), { moves: 1 });
    expect(useContinue(s)).toEqual({ ok: false, reason: 'not_playing' });
    ok(tap(s, { x: 0, y: 0 }));
    expect(s.status).toBe('lost');
    expect(useContinue(s)).toEqual({ ok: true, events: [{ type: 'bonusMove', amount: 5, source: 'continue' }] });
    expect(s.status).toBe('playing');
    expect(s.movesLeft).toBe(5);
    expect(s.continueUsed).toBe(true);
    expect(stars(s)).toBe(1);
    s.movesLeft = 0;
    s.status = 'lost';
    expect(useContinue(s)).toEqual({ ok: false, reason: 'continue_used' });
  });
});

describe('stars', () => {
  const at = (moves: number, left: number, perks: PerkId[] = []) => {
    const s = raw(board(['rr......']), { moves, perks });
    s.movesLeft = left;
    return stars(s);
  };
  it.each([
    [10, 10, 3],
    [10, 4, 3], // exactly 40%
    [10, 3, 2],
    [20, 3, 2], // exactly 15%
    [20, 2, 1],
    [10, 0, 1],
  ])('budget %i, %i left -> %i stars', (moves, left, expected) => {
    expect(at(moves, left)).toBe(expected);
  });
  it('unlimited gives 3', () => {
    expect(stars(raw(board(['rr......']), { moves: null }))).toBe(3);
  });
});

describe('perks', () => {
  it('jeweler_brilliant: a clear of 10+ gives +1 move (net 0 for that tap)', () => {
    const s = raw(board(['rrrrrrrr', 'rr......']), { perks: ['jeweler_brilliant'] });
    const events = ok(tap(s, { x: 0, y: 0 }));
    expect(ofType(events, 'bonusMove')).toEqual([{ type: 'bonusMove', amount: 1, source: 'brilliant' }]);
    expect(s.movesLeft).toBe(20);
    const nine = raw(board(['rrrrrrrr', 'r.......']), { perks: ['jeweler_brilliant'] });
    expect(ofType(ok(tap(nine, { x: 0, y: 0 })), 'bonusMove')).toHaveLength(0);
  });
});

describe('transmute (alch_transmute)', () => {
  it('recolours to the adjacent colour that makes the largest group, once per level, for 1 move', () => {
    // The ruby pair touches a sapphire (1 block) and an emerald pair (2 blocks): emerald wins.
    const s = raw(board(['rrb.....', 'gg......']), { perks: ['alch_transmute'] });
    expect(s.transmutesLeft).toBe(1);
    const events = ok(transmute(s, { x: 0, y: 0 }));
    expect(events[0]).toEqual({ type: 'recoloured', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: 2 });
    expect(ascii(s, 0, 2)).toEqual(['gg......', 'ggb.....']); // the sapphire had nothing under it
    expect(s.movesLeft).toBe(19);
    expect(transmute(s, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'no_transmute' });
  });

  it('needs the perk, a block, and a differently coloured neighbour', () => {
    expect(transmute(raw(board(['rrb.....'])), { x: 0, y: 0 })).toEqual({ ok: false, reason: 'no_transmute' });
    const s = raw(board(['rr......', '........']), { perks: ['alch_transmute'] });
    expect(transmute(s, { x: 5, y: 0 })).toEqual({ ok: false, reason: 'not_a_group' });
    expect(transmute(s, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'no_target' });
  });

  it('is refused while a power is armed, and keeps geode flags', () => {
    const s = raw(board(['rrb.....', 'gg......']), { perks: ['alch_transmute'], tray: [pw(0, 1)], geodes: [[0, 0]] });
    ok(armPower(s, 0));
    expect(transmute(s, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'power_armed' });
    ok(armPower(s, 0));
    ok(transmute(s, { x: 0, y: 0 }));
    expect(s.grid.flat().filter((c) => c.kind === 'block' && c.geode)).toHaveLength(1);
  });
});

describe('createLevelState', () => {
  it('copies the definition and settles the start view', () => {
    const d = def(['........', '........', '........', '........', ...board([], 16)]);
    const s: LevelState = createLevelState(d, [], 1);
    expect(s.scroll).toBe(2); // rows 0-3 are empty: scroll until a block is in the top 3 rows
    s.grid[5]![0] = { kind: 'empty' };
    expect(d.rows[5]![0]!.kind).toBe('block');
    expect(() => createLevelState({ ...d, rows: [['bad' as never]] }, [], 1)).toThrow();
  });
});
