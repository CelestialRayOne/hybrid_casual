import { describe, expect, it } from 'vitest';
import {
  addReforgeTokens, canReforge, defaultProgress, grantPendingPerkPoints, grantPerkPoint, nextPerkPointLevel,
  pendingPerkPoints, perkPointDue, perkStatus, reforge, spendPerkPoint,
} from './progress';
import type { Progress } from './types';

const won = (...levels: number[]): Progress => ({
  ...defaultProgress(),
  stars: Object.fromEntries(levels.map((l) => [l, 2])) as Progress['stars'],
  unlocked: Math.max(1, ...levels) + 1,
});

describe('perk economy', () => {
  it('default progress is v2 and empty', () => {
    expect(defaultProgress()).toEqual({
      version: 2, stars: {}, unlocked: 1, perks: [], perkPoints: 0, perkPointsGranted: [], reforgeTokens: 0,
      tutorialsSeen: [], settings: { sound: true },
    });
  });

  it('grants a point once per schedule level, only for schedule levels', () => {
    const p = won(1, 2, 3);
    expect(perkPointDue(p, 3)).toBe(true);
    expect(perkPointDue(p, 4)).toBe(false);
    const a = grantPerkPoint(p, 3);
    expect(a.perkPoints).toBe(1);
    expect(a.perkPointsGranted).toEqual([3]);
    expect(grantPerkPoint(a, 3)).toBe(a);
    expect(grantPerkPoint(a, 4)).toBe(a);
    expect(p.perkPoints).toBe(0); // input untouched
  });

  it('pending points: won schedule levels not granted yet (page closed on the win card)', () => {
    const p = won(1, 2, 3, 4, 5, 6, 7);
    expect(pendingPerkPoints(p)).toEqual([3, 7]);
    const g = grantPendingPerkPoints(p);
    expect(g.perkPoints).toBe(2);
    expect(pendingPerkPoints(g)).toEqual([]);
    expect(nextPerkPointLevel(g)).toBe(11);
    expect(nextPerkPointLevel({ ...g, perkPointsGranted: [3, 7, 11, 15, 19] })).toBeNull();
  });

  it('spends points on unowned perks only', () => {
    let p = grantPendingPerkPoints(won(3, 7));
    expect(perkStatus(p, 'smith_tempered')).toBe('available');
    p = spendPerkPoint(p, 'smith_tempered');
    expect(p.perks).toEqual(['smith_tempered']);
    expect(p.perkPoints).toBe(1);
    expect(perkStatus(p, 'smith_tempered')).toBe('owned');
    expect(spendPerkPoint(p, 'smith_tempered')).toBe(p);
    p = spendPerkPoint(p, 'arch_treasure');
    expect(p.perkPoints).toBe(0);
    expect(perkStatus(p, 'jeweler_flawless')).toBe('locked');
    expect(spendPerkPoint(p, 'jeweler_flawless')).toBe(p);
  });

  it('reforge: 1 token refunds every perk as points', () => {
    let p = spendPerkPoint(spendPerkPoint(grantPendingPerkPoints(won(3, 7, 11)), 'smith_tempered'), 'alch_volatile');
    expect(canReforge(p)).toBe(false); // no token
    expect(reforge(p)).toBe(p);
    p = addReforgeTokens(p, 2);
    const r = reforge(p);
    expect(r).toMatchObject({ perks: [], perkPoints: 3, reforgeTokens: 1 });
    expect(canReforge(r)).toBe(false); // nothing to refund
  });

  it('tokens clamp to 0..9', () => {
    const p = addReforgeTokens(defaultProgress(), 20);
    expect(p.reforgeTokens).toBe(9);
    expect(addReforgeTokens(p, 1)).toBe(p);
    expect(addReforgeTokens(p, -50).reforgeTokens).toBe(0);
  });
});
