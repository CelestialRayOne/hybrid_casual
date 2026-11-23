import { describe, expect, it } from 'vitest';
import { Rng, hashSeed, nextInt, nextRandom } from './rng';

describe('rng', () => {
  it('is deterministic and stays in [0, 1)', () => {
    let a = 42;
    let b = 42;
    for (let i = 0; i < 1000; i++) {
      const [va, sa] = nextRandom(a);
      const [vb, sb] = nextRandom(b);
      expect(va).toBe(vb);
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
      expect(Number.isInteger(sa) && sa >= 0 && sa <= 0xffffffff).toBe(true);
      a = sa;
      b = sb;
    }
  });

  it('matches the reference mulberry32 sequence', () => {
    function ref(seed: number) {
      let s = seed;
      return () => {
        let t = (s += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const r = ref(123);
    let s = 123;
    for (let i = 0; i < 50; i++) {
      const [v, n] = nextRandom(s);
      expect(v).toBe(r());
      s = n;
    }
  });

  it('nextInt covers [0, n) roughly uniformly', () => {
    const counts = [0, 0, 0, 0, 0];
    let s = 9;
    for (let i = 0; i < 5000; i++) {
      const [v, n] = nextInt(s, 5);
      counts[v] = (counts[v] ?? 0) + 1;
      s = n;
    }
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });

  it('hashSeed mixes inputs', () => {
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2));
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
    expect(hashSeed(0)).not.toBe(hashSeed(1));
  });

  it('Rng helpers are deterministic', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    expect(a.shuffle([1, 2, 3, 4, 5, 6])).toEqual(b.shuffle([1, 2, 3, 4, 5, 6]));
    expect(a.weighted([0, 0, 1])).toBe(2);
    expect(() => a.pick([])).toThrow();
  });
});
