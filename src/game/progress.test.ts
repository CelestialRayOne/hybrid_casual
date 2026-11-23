import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, PERK_POINT_AFTER, spendPerkPoint } from '../core';
import { defaultProgress } from '../platform/save';
import {
  allLevelsDone, applyTokens, applyWin, currentLevel, isUnlocked, markTutorialSeen, nextLevelAfter, perkOffer, pointEarned,
  samePerks, totalStars, tutorialSeen,
} from './progress';

describe('progress', () => {
  it('starts on level 1 with only level 1 unlocked', () => {
    const p = defaultProgress();
    expect(currentLevel(p)).toBe(1);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });

  it('keeps the best stars and unlocks the next level', () => {
    let p = applyWin(defaultProgress(), 1, 2);
    expect(p.stars[1]).toBe(2);
    expect(p.unlocked).toBe(2);
    p = applyWin(p, 1, 1);
    expect(p.stars[1]).toBe(2);
    p = applyWin(p, 1, 3);
    expect(p.stars[1]).toBe(3);
    expect(totalStars(p)).toBe(3);
    expect(currentLevel(p)).toBe(2);
  });

  it('never unlocks past the last level and detects completion', () => {
    let p = { ...defaultProgress(), unlocked: LEVEL_COUNT };
    expect(allLevelsDone(p)).toBe(false);
    p = applyWin(p, LEVEL_COUNT, 1);
    expect(p.unlocked).toBe(LEVEL_COUNT);
    expect(allLevelsDone(p)).toBe(true);
    expect(nextLevelAfter(LEVEL_COUNT)).toBeNull();
    expect(nextLevelAfter(3)).toBe(4);
  });

  it('grants a perk point on the first win of each point level only', () => {
    let p = defaultProgress();
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const before = p;
      p = applyWin(p, l, 1);
      expect(pointEarned(before, p, l)).toBe(PERK_POINT_AFTER.includes(l));
    }
    expect(p.perkPoints).toBe(PERK_POINT_AFTER.length);
    const again = applyWin(p, 3, 3);
    expect(pointEarned(p, again, 3)).toBe(false);
    expect(again.perkPoints).toBe(p.perkPoints);
  });

  it('offers up to 3 unowned perks, deterministically', () => {
    let p = applyWin(defaultProgress(), 3, 2);
    const offer = perkOffer(p, 3);
    expect(offer).toHaveLength(3);
    expect(perkOffer(p, 3)).toEqual(offer);
    p = spendPerkPoint(p, offer[0]!);
    expect(perkOffer(p, 7)).not.toContain(offer[0]);
  });

  it('adds reforge tokens, clamped', () => {
    const p = defaultProgress();
    expect(applyTokens(p, 0)).toBe(p);
    expect(applyTokens(p, 2).reforgeTokens).toBe(2);
    expect(applyTokens(p, 50).reforgeTokens).toBe(9);
  });

  it('does not mutate its input', () => {
    const p = defaultProgress();
    applyWin(p, 3, 3);
    applyTokens(p, 1);
    markTutorialSeen(p, 'tap');
    expect(p).toEqual(defaultProgress());
  });

  it('compares perk sets ignoring order', () => {
    expect(samePerks(['arch_softcrust', 'smith_toolbelt'], ['smith_toolbelt', 'arch_softcrust'])).toBe(true);
    expect(samePerks(['arch_softcrust'], ['smith_toolbelt'])).toBe(false);
    expect(samePerks([], ['smith_toolbelt'])).toBe(false);
  });

  it('records seen tutorials once', () => {
    let p = defaultProgress();
    expect(tutorialSeen(p, 'dirt')).toBe(false);
    p = markTutorialSeen(p, 'dirt');
    expect(markTutorialSeen(p, 'dirt')).toBe(p);
    expect(tutorialSeen(p, 'dirt')).toBe(true);
    expect(p.tutorialsSeen).toEqual(['dirt']);
  });
});
