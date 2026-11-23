import { describe, expect, it } from 'vitest';
import { armPower, tap } from './actions';
import { pw, raw, setBoon } from './testkit';
import type { ActionResult, BoonId, CoreEvent, LevelState } from './types';

function ok(r: ActionResult): CoreEvent[] {
  if (!r.ok) throw new Error(`action failed: ${r.reason}`);
  return r.events;
}
const ofType = <T extends CoreEvent['type']>(events: CoreEvent[], type: T) =>
  events.filter((e): e is Extract<CoreEvent, { type: T }> => e.type === type);

const FILL = ['ppyyppyy', 'yyppyypp'];
/**
 * Relic A at (2,0) next to a ruby pair (soft crust: one clear collects it), relic B in view at (6,4) with live
 * gems around, and two guard relics C/D below the view so the level keeps going.
 */
function board(): string[] {
  const rows = ['rrA.....', 'gggb....', FILL[0]!, FILL[1]!, 'ppyyppBy', FILL[1]!, FILL[0]!, FILL[1]!, FILL[0]!, FILL[1]!];
  return [...rows, 'ppyyppyC', 'yyppyypD'];
}
function collectA(boon: BoonId, setup: (s: LevelState) => void = () => {}): { s: LevelState; events: CoreEvent[] } {
  const s = raw(board(), { perks: ['arch_softcrust'] });
  setBoon(s, 0, boon);
  setup(s);
  return { s, events: ok(tap(s, { x: 0, y: 0 })) };
}

describe('relic boons', () => {
  it('collecting a relic emits relicCollected then boonGained with the stack count', () => {
    const { s, events } = collectA('compass');
    const i = events.findIndex((e) => e.type === 'relicCollected');
    expect(events[i]).toEqual({ type: 'relicCollected', relicId: 0, boon: 'compass', bonus: false, collected: 1, goal: 4 });
    expect(events[i + 1]).toEqual({ type: 'boonGained', boon: 'compass', stacks: 1, relicId: 0 });
    expect(s.boons.compass).toBe(1);
  });

  it('Sun Coin: +2 moves right away, per stack', () => {
    const { s, events } = collectA('sun_coin', (st) => (st.boons.sun_coin = 1));
    expect(ofType(events, 'bonusMove')).toEqual([{ type: 'bonusMove', amount: 2, source: 'sun_coin' }]);
    expect(s.movesLeft).toBe(20 - 1 + 2);
    expect(s.boons.sun_coin).toBe(2);
  });

  it('Sun Coin on an unlimited level does nothing to moves', () => {
    const s = raw(board(), { perks: ['arch_softcrust'], moves: null });
    setBoon(s, 0, 'sun_coin');
    expect(ofType(ok(tap(s, { x: 0, y: 0 })), 'bonusMove')).toEqual([]);
    expect(s.movesLeft).toBeNull();
  });

  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [5, 3],
  ])('Star Amulet with %i earlier stacks: a random power of level %i right away', (before, level) => {
    const { s, events } = collectA('star_amulet', (st) => (st.boons.star_amulet = before));
    expect(ofType(events, 'powerCharged')).toEqual([expect.objectContaining({ level, source: 'boon', merged: false })]);
    expect(s.tray).toHaveLength(1);
  });

  it('Ancient Key: other crusts lose 1 HP now (visible ones can break and chain), hidden ones keep 1; later chips double', () => {
    const { s, events } = collectA('ancient_key');
    // B is visible (crust 1 with soft brush) -> 0 -> collected, with its own boon (compass in the testkit).
    // C and D are below the view: 1 stays 1.
    const chips = ofType(events, 'crustChipped');
    expect(chips.map((c) => [c.relicId, c.crust])).toEqual([[0, 0], [1, 0]]);
    expect(ofType(events, 'relicCollected').map((e) => e.relicId)).toEqual([0, 1]);
    expect(s.relics[2]!.crust).toBe(1);
    expect(s.collected).toBe(2);
    expect(s.boons.ancient_key).toBe(1);
    // Later chips count double: a 2-crust relic breaks with one clear.
    const t = raw(board(), { boons: { ancient_key: 1 } });
    ok(tap(t, { x: 0, y: 0 }));
    expect(t.relics[0]!.collected).toBe(true);
  });

  it('Ancient Key stacks: chips x(1 + stacks)', () => {
    const t = raw(board(), { boons: { ancient_key: 2 } });
    t.relics[0]!.crust = 3;
    ok(tap(t, { x: 0, y: 0 }));
    expect(t.relics[0]!.collected).toBe(true);
  });

  it('Chalice, Compass, Crowned Ring are passive and stack', () => {
    const { s } = collectA('crowned_ring', (st) => (st.boons.crowned_ring = 1));
    expect(s.boons.crowned_ring).toBe(2);
  });

  it('boons apply to powers too: Ancient Key doubles a Drill chip', () => {
    const s = raw(board(), { boons: { ancient_key: 1 }, tray: [pw(4, 1)] });
    s.relics[0]!.crust = 4;
    ok(armPower(s, 0));
    const events = ok(tap(s, { x: 2, y: 0 }));
    expect(ofType(events, 'crustChipped')[0]).toEqual({ type: 'crustChipped', relicId: 0, crust: 0 });
  });
});

describe('bonus relics and tokens', () => {
  it('collecting 3 bonus relics in an attempt guarantees one reforge token (once)', () => {
    const rows = ['rA.bB.gC', 'r..b..g.', ...FILL, ...FILL, ...FILL, ...FILL, 'ppyyppyD'];
    const s = raw(rows, { perks: ['arch_softcrust'], bonus: [0, 1, 2] });
    expect(s.goal).toBe(1);
    s.goal = 4; // keep playing for the test
    const events: CoreEvent[] = [];
    for (const at of [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }]) events.push(...ok(tap(s, at)));
    expect(s.stats.bonusCollected).toBe(3);
    expect(ofType(events, 'reforgeTokenEarned')).toEqual([{ type: 'reforgeTokenEarned', reason: 'bonus_relics' }]);
    expect(s.stats.reforgeTokens).toBe(1);
    // The token follows the third bonus relic, before its boon.
    const i = events.findIndex((e) => e.type === 'reforgeTokenEarned');
    expect(events[i - 1]).toMatchObject({ type: 'relicCollected', bonus: true, collected: 3 });
    expect(s.status).toBe('playing');
  });

  it('a 3-star win rolls a 30% token; other wins never do', () => {
    let tokens = 0;
    for (let seed = 0; seed < 300; seed++) {
      const s = raw(['rrA.....', 'gggb....', ...FILL, ...FILL, ...FILL, ...FILL], { perks: ['arch_softcrust'] });
      s.rngState = seed * 4099;
      const events = ok(tap(s, { x: 0, y: 0 }));
      expect(s.status).toBe('won');
      const won = events.findIndex((e) => e.type === 'won');
      const t = events.findIndex((e) => e.type === 'reforgeTokenEarned');
      if (t >= 0) {
        expect(t).toBeGreaterThan(won);
        tokens++;
      }
    }
    expect(tokens / 300).toBeGreaterThan(0.22);
    expect(tokens / 300).toBeLessThan(0.38);
    const low = raw(['rrA.....', 'gggb....', ...FILL, ...FILL, ...FILL, ...FILL], { perks: ['arch_softcrust'], moves: 10 });
    low.movesLeft = 2;
    const events = ok(tap(low, { x: 0, y: 0 }));
    expect(events.find((e) => e.type === 'won')).toEqual({ type: 'won', stars: 1 });
    expect(ofType(events, 'reforgeTokenEarned')).toEqual([]);
  });
});
