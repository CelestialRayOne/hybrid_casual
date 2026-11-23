import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVEL_COUNT } from '../core/types';
import type { Progress } from '../core/types';
import {
  DEFAULT_SAVE_KEY, defaultProgress, localStorageSaveStore, memorySaveStore, migrateProgress, migrateV1toV2, parseProgress,
} from './save';
import type { KeyValue } from './storage';

function fakeStorage(init: Record<string, string> = {}): KeyValue & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

function throwingStorage(): KeyValue {
  const fail = () => { throw new Error('SecurityError'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

const sample: Progress = {
  version: 2,
  stars: { 1: 3, 2: 1, 3: 2 },
  unlocked: 4,
  perks: ['jeweler_brilliant', 'smith_toolbelt'],
  perkPoints: 1,
  perkPointsGranted: [3],
  reforgeTokens: 2,
  tutorialsSeen: [],
  settings: { sound: false },
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('localStorageSaveStore', () => {
  it('round-trips progress', async () => {
    const storage = fakeStorage();
    const store = localStorageSaveStore(DEFAULT_SAVE_KEY, { storage });
    expect(await store.load()).toEqual(defaultProgress());
    await store.save(sample);
    expect(JSON.parse(storage.data.get(DEFAULT_SAVE_KEY)!)).toEqual(sample);
    const again = localStorageSaveStore(DEFAULT_SAVE_KEY, { storage });
    expect(await again.load()).toEqual(sample);
  });

  it('returns copies, not internal state', async () => {
    const store = localStorageSaveStore('k', { storage: fakeStorage() });
    await store.save(sample);
    const a = await store.load();
    a.stars[1] = 0;
    expect((await store.load()).stars[1]).toBe(3);
  });

  it('reset clears storage', async () => {
    const storage = fakeStorage();
    const store = localStorageSaveStore('k', { storage });
    await store.save(sample);
    await store.reset();
    expect(storage.data.has('k')).toBe(false);
    expect(await store.load()).toEqual(defaultProgress());
  });

  it.each([
    ['not json', '{oops'],
    ['null', 'null'],
    ['array', '[1,2]'],
    ['no version', '{"unlocked":3}'],
    ['future version', '{"version":99,"unlocked":3}'],
    ['string version', '{"version":"2","unlocked":3}'],
  ])('falls back to defaults on corruption: %s', async (_, raw) => {
    const store = localStorageSaveStore('k', { storage: fakeStorage({ k: raw }) });
    expect(await store.load()).toEqual(defaultProgress());
  });

  it('sanitises invalid fields individually', async () => {
    const raw = JSON.stringify({
      version: 2,
      stars: { 1: 3, 2: 7, x: 2, '-1': 1, '1.5': 2, 3: '2', 4: 2 },
      unlocked: -3,
      perks: ['alch_volatile', 'bogus', 'alch_volatile', 5, 'smith_forge'],
      perkPoints: 2.5,
      perkPointsGranted: [7, 3, 3, 4, 'a', 0, 2.5],
      reforgeTokens: 40,
      settings: { sound: 'yes' },
      extra: 'dropped',
    });
    const p = await localStorageSaveStore('k', { storage: fakeStorage({ k: raw }) }).load();
    expect(p).toEqual({
      version: 2, stars: { 1: 3, 4: 2 }, unlocked: 1, perks: ['alch_volatile'], perkPoints: 0, perkPointsGranted: [3, 7],
      reforgeTokens: 9, tutorialsSeen: [], settings: { sound: true },
    });
  });

  it('clamps unlocked to the level count and drops stars for levels that do not exist', async () => {
    const raw = JSON.stringify({ version: 2, stars: { 1: 3, 20: 2, 21: 3, 999: 1, 0: 2 }, unlocked: 500 });
    const p = await localStorageSaveStore('k', { storage: fakeStorage({ k: raw }) }).load();
    expect(p.unlocked).toBe(LEVEL_COUNT);
    expect(p.stars).toEqual({ 1: 3, 20: 2 });
  });

  it('keeps seen tutorials (saves without the field load with [])', async () => {
    const storage = fakeStorage();
    const store = localStorageSaveStore('k', { storage });
    await store.save({ ...sample, tutorialsSeen: ['dirt', 'charge'] });
    expect((await localStorageSaveStore('k', { storage }).load()).tutorialsSeen).toEqual(['dirt', 'charge']);
    const old = JSON.stringify({ version: 1, stars: { 1: 3 }, unlocked: 2, perks: [], perkPicksTaken: [], settings: { sound: true } });
    const p = await localStorageSaveStore('k', { storage: fakeStorage({ k: old }) }).load();
    expect(p.tutorialsSeen).toEqual([]);
    expect(p.stars).toEqual({ 1: 3 });
  });

  it('sanitises seen tutorials: strings with a short id shape only, deduplicated, capped', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `t${i}`);
    const raw = JSON.stringify({
      version: 2, unlocked: 1,
      tutorialsSeen: ['dirt', 'dirt', 5, null, '', '<script>', 'x'.repeat(40), 'bigGroup', ...many],
    });
    const p = await localStorageSaveStore('k', { storage: fakeStorage({ k: raw }) }).load();
    expect(p.tutorialsSeen.slice(0, 3)).toEqual(['dirt', 'bigGroup', 't0']);
    expect(p.tutorialsSeen).toHaveLength(32);
    const bad = JSON.stringify({ version: 2, tutorialsSeen: 'dirt' });
    expect((await localStorageSaveStore('k', { storage: fakeStorage({ k: bad }) }).load()).tutorialsSeen).toEqual([]);
  });

  it('degrades to memory when storage throws', async () => {
    const store = localStorageSaveStore('k', { storage: throwingStorage() });
    expect(await store.load()).toEqual(defaultProgress());
    await expect(store.save(sample)).resolves.toBeUndefined();
    expect(await store.load()).toEqual(sample);
    await store.reset();
    expect(await store.load()).toEqual(defaultProgress());
  });

  it('keeps unsaved progress in memory when only writes fail (quota)', async () => {
    const storage = fakeStorage({ k: JSON.stringify({ ...sample, unlocked: 2 }) });
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    const store = localStorageSaveStore('k', { storage });
    await store.save(sample);
    expect((await store.load()).unlocked).toBe(4);
  });

  it('uses no storage when localStorage access itself throws', async () => {
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('denied'); }, configurable: true });
    try {
      const store = localStorageSaveStore();
      await store.save(sample);
      expect(await store.load()).toEqual(sample);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('uses window.localStorage by default', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    await localStorageSaveStore().save(sample);
    expect(storage.data.has(DEFAULT_SAVE_KEY)).toBe(true);
  });
});

describe('migrations', () => {
  it('runs the hook chain for older versions', async () => {
    // Pretend a v0 schema stored `level` instead of `unlocked`.
    const migrations = {
      0: (old: Record<string, unknown>) => ({ ...old, version: 1, unlocked: old.level }),
      1: migrateV1toV2,
    };
    const storage = fakeStorage({ k: JSON.stringify({ version: 0, level: 6 }) });
    const p = await localStorageSaveStore('k', { storage, migrations }).load();
    expect(p.unlocked).toBe(6);
    expect(p.version).toBe(2);
  });

  it('rejects missing steps, throwing steps and steps that do not advance', () => {
    expect(migrateProgress({ version: 0 }, {})).toBeNull();
    expect(migrateProgress({ version: 0 }, { 0: () => { throw new Error('x'); } })).toBeNull();
    expect(migrateProgress({ version: 0 }, { 0: (o) => o })).toBeNull();
    expect(migrateProgress({ version: 2, a: 1 })).toEqual({ version: 2, a: 1 });
  });

  it('parseProgress handles null', () => {
    expect(parseProgress(null)).toEqual(defaultProgress());
  });
});

describe('v1 -> v2 migration', () => {
  const v1 = (o: Record<string, unknown>) =>
    JSON.stringify({ version: 1, stars: {}, unlocked: 1, perks: [], perkPicksTaken: [], settings: { sound: true }, ...o });

  it('keeps surviving perks, turns removed perks into points, grants won schedule levels', () => {
    // Won 1..10, took the v1 picks after 4 and 10: Brilliant Cut (kept) and Quick Hands (removed).
    const stars = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 2]));
    const p = parseProgress(
      v1({ stars, unlocked: 11, perks: ['jeweler_brilliant', 'smith_apprentice'], perkPicksTaken: [4, 10], tutorialsSeen: ['dirt'] }),
    );
    expect(p).toEqual({
      version: 2, stars, unlocked: 11, perks: ['jeweler_brilliant'],
      // New schedule: 3 and 7 won -> 2 points; 1 perk kept -> 1 unspent (the removed perk's point).
      perkPoints: 1, perkPointsGranted: [3, 7], reforgeTokens: 0, tutorialsSeen: ['dirt'], settings: { sound: true },
    });
  });

  it('never gives fewer unspent points than removed perks, nor fewer than the new schedule allows', () => {
    // Hand-edited: 3 removed perks, only level 3 won.
    const a = parseProgress(v1({ stars: { 3: 1 }, perks: ['smith_forge', 'arch_keeneye', 'alch_reserves'] }));
    expect(a.perks).toEqual([]);
    expect(a.perkPoints).toBe(3);
    // Won up to 19 with 3 kept perks: 5 schedule points, 3 used -> 2 unspent.
    const stars = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, 3]));
    const b = parseProgress(v1({ stars, perks: ['jeweler_brilliant', 'arch_softcrust', 'alch_transmute'], perkPicksTaken: [4, 10, 16] }));
    expect(b.perks).toHaveLength(3);
    expect(b.perkPoints).toBe(2);
    expect(b.perkPointsGranted).toEqual([3, 7, 11, 15, 19]);
  });

  it('a fresh v1 save migrates to a fresh v2 save', () => {
    expect(parseProgress(v1({}))).toEqual(defaultProgress());
    expect(migrateV1toV2({ version: 1 })).toMatchObject({ version: 2, perks: [], perkPoints: 0, perkPointsGranted: [] });
  });
});

describe('memorySaveStore', () => {
  it('round-trips and resets', async () => {
    const store = memorySaveStore();
    await store.save(sample);
    expect(await store.load()).toEqual(sample);
    await store.reset();
    expect(await store.load()).toEqual(defaultProgress());
  });
});
