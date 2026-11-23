import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, PERK_IDS, PERK_POINT_AFTER, PERKS, isPerkId, offerPerks, rulesFor } from './rules';
import type { PerkId, Rules } from './types';

describe('rules', () => {
  it('defaults with no perks (the debug "perks off" flag passes [])', () => {
    expect(rulesFor([])).toEqual({ ...DEFAULT_RULES });
    expect(rulesFor([])).toMatchObject({ powerThreshold: 6, trayCapacity: 3, crustHp: 2, revealRows: 2, bonusRelics: 0 });
  });

  it.each<[PerkId, Partial<Rules>]>([
    ['jeweler_brilliant', { brilliantMoveAt: 10 }],
    ['jeweler_flawless', { flawlessAt: 12 }],
    ['arch_softcrust', { crustHp: 1 }],
    ['arch_treasure', { revealRows: 5, bonusRelics: 1 }],
    ['alch_transmute', { transmutesPerLevel: 1 }],
    ['alch_volatile', { volatileChance: 0.25 }],
    ['smith_toolbelt', { trayCapacity: 4 }],
    ['smith_tempered', { temperedBonus: 1 }],
  ])('%s', (perk, change) => {
    expect(rulesFor([perk])).toEqual({ ...DEFAULT_RULES, ...change });
  });

  it('has 8 perks, 2 per path, with the spec names', () => {
    expect(PERK_IDS).toHaveLength(8);
    const perPath = new Map<string, number>();
    for (const id of PERK_IDS) perPath.set(PERKS[id].path, (perPath.get(PERKS[id].path) ?? 0) + 1);
    expect([...perPath.values()]).toEqual([2, 2, 2, 2]);
    expect(PERK_IDS.map((id) => PERKS[id].name)).toEqual([
      'Brilliant Cut', 'Flawless', 'Soft Brush', 'Treasure Sense', 'Transmutation', 'Volatile Mix', 'Tool Belt', 'Tempered',
    ]);
    const banned = /diablo|blizzard|horadric|sanctuary|tristram|jordan|\besr\b|\brune/i;
    for (const id of PERK_IDS) {
      expect(PERKS[id].name).not.toMatch(banned);
      expect(PERKS[id].description).not.toMatch(banned);
    }
    expect(isPerkId('smith_forge')).toBe(false);
    expect(isPerkId('smith_tempered')).toBe(true);
  });

  it('offerPerks: up to 3 unowned, deterministic per seed', () => {
    const owned: PerkId[] = ['arch_treasure', 'smith_toolbelt'];
    const a = offerPerks(owned, 77);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    for (const p of a) expect(owned).not.toContain(p);
    expect(offerPerks(owned, 77)).toEqual(a);
    const variety = new Set(Array.from({ length: 20 }, (_, i) => offerPerks([], i).join()));
    expect(variety.size).toBeGreaterThan(5);
    expect(offerPerks(PERK_IDS.slice(0, 7), 1)).toEqual([PERK_IDS[7]]);
    expect(offerPerks(PERK_IDS, 1)).toEqual([]);
  });

  it('perk points follow levels 3, 7, 11, 15 and 19', () => {
    expect(PERK_POINT_AFTER).toEqual([3, 7, 11, 15, 19]);
  });
});
