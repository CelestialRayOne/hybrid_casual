// Whole-game invariants over many seeded plays of every level, on random attempts.
import { describe, expect, it } from 'vitest';
import { RANDOM_PROFILE, applyBotAction, playCasual } from './bot';
import { blockColor, hasAnyGroup, isRelicVisible, isStuckGem } from './board';
import { LEVEL_COUNT, getLevel } from './generator';
import { createLevelState } from './level';
import type { LevelState, Pos, Relic } from './types';

/**
 * Independent of isStranded: a visible crusted relic is UNREACHABLE by clears when every gem that could still
 * touch it (orthogonal neighbours, and anything above its top/side neighbours) is above the window or stuck.
 */
function unreachable(s: LevelState, r: Relic): boolean {
  if (r.collected || !isRelicVisible(s, r)) return false;
  const cells: Pos[] = [];
  for (let i = 0; i < r.size; i++) {
    cells.push({ x: r.x + i, y: r.y + r.size });
    for (const [x, y0] of [[r.x + i, r.y - 1], [r.x - 1, r.y + i], [r.x + r.size, r.y + i]] as const) {
      for (let y = y0; y >= 0; y--) cells.push({ x, y });
    }
  }
  return cells.every((p) => blockColor(s, p.x, p.y) === null || p.y < s.scroll || isStuckGem(s, p.x, p.y));
}

describe('invariants over seeded plays of all levels', () => {
  it('never stalls, never spends a move on an unreachable relic with an empty tray, never ends armed', () => {
    let plays = 0;
    let actions = 0;
    const where: string[] = [];
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      const def = getLevel(id);
      for (const [profile, seeds] of [[undefined, 6], [RANDOM_PROFILE, 6]] as const) {
        for (let seed = 1; seed <= seeds; seed++) {
          const opts = profile ? { profile } : {};
          const attempt = seed * 1000 + id;
          // Generous budget so plays run deep into each level; perks on half the runs.
          const perks = seed % 2 ? [] : (['smith_toolbelt', 'alch_volatile', 'arch_treasure', 'arch_softcrust'] as const);
          const d = { ...def, moves: def.moves === null ? null : def.moves * 2 };
          const run = playCasual(d, [...perks], attempt, seed, opts);
          const s = createLevelState(d, [...perks], attempt);
          plays++;
          for (const a of run.actions) {
            const before = s.movesUsed;
            const res = applyBotAction(s, a);
            expect(res.ok).toBe(true);
            actions++;
            if (s.status !== 'playing') break;
            if (s.armed !== null) continue;
            // Stalled = nothing to tap and no power: the resolution must already have fixed it.
            if (!hasAnyGroup(s) && s.tray.length === 0 && s.movesLeft !== 0) where.push(`L${id} a${attempt} stall`);
            if (s.movesUsed > before && s.tray.length === 0 && s.relics.some((r) => unreachable(s, r))) {
              where.push(`L${id} a${attempt} move ${s.movesUsed}`);
            }
          }
          expect(JSON.stringify(s)).toBe(JSON.stringify(run.final)); // replay is deterministic
          if (s.status !== 'playing') expect(s.armed).toBeNull();
        }
      }
    }
    expect(plays).toBe(LEVEL_COUNT * 12);
    expect(actions).toBeGreaterThan(plays * 10);
    expect(where.slice(0, 5)).toEqual([]);
  }, 120_000);

  it('a playing state always has a group, a power, or 0 moves (no dead state survives an action)', () => {
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const s = createLevelState(getLevel(id), [], attempt);
        expect(s.status).toBe('playing');
        expect(hasAnyGroup(s) || s.tray.length > 0).toBe(true);
      }
    }
  });
});
