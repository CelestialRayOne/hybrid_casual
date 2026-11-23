import { describe, expect, it } from 'vitest';
import { applyBotAction, playBot, playCasual } from './bot';
import { getLevel } from './generator';
import { createLevelState, deserializeState, serializeState } from './level';
import type { ActionResult, LevelDef, PerkId } from './types';

function replay(def: LevelDef, perks: PerkId[], attempt: number, actions: ReturnType<typeof playBot>['actions']) {
  const state = createLevelState(def, perks, attempt);
  const results: ActionResult[] = actions.map((a) => applyBotAction(state, a));
  return { state, results };
}

describe('determinism', () => {
  it.each([3, 6, 15])('level %i: same def + perks + attempt seed + actions -> identical state and events', (id) => {
    const def = { ...getLevel(id), moves: 99 };
    const perks: PerkId[] = ['smith_toolbelt', 'alch_volatile', 'smith_tempered', 'jeweler_flawless'];
    const run = playBot(def, perks, 777);
    expect(run.actions.length).toBeGreaterThan(3);
    expect(run.actions.some((a) => a.type === 'arm')).toBe(true);
    const a = replay(def, perks, 777, run.actions);
    const b = replay(def, perks, 777, run.actions);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results));
    expect(a.results.every((r) => r.ok)).toBe(true);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(run.final));
  });

  it('different attempt seeds give different games', () => {
    const def = getLevel(9);
    const a = playCasual(def, [], 1, 5);
    const b = playCasual(def, [], 2, 5);
    expect(JSON.stringify(a.actions)).not.toBe(JSON.stringify(b.actions));
  });

  it('serialisation round-trips mid-level (with powers and boons) and continues identically', () => {
    const def = { ...getLevel(10), moves: 99 };
    const run = playBot(def, ['alch_volatile'], 31);
    const half = Math.floor(run.actions.length / 2);
    const live = createLevelState(def, ['alch_volatile'], 31);
    run.actions.slice(0, half).forEach((a) => applyBotAction(live, a));

    const restored = deserializeState(serializeState(live));
    const plain = JSON.parse(JSON.stringify(live)) as typeof live;
    expect(restored).toEqual(plain);

    const rest = run.actions.slice(half);
    const liveEvents = rest.map((a) => applyBotAction(live, a));
    const restoredEvents = rest.map((a) => applyBotAction(restored, a));
    const plainEvents = rest.map((a) => applyBotAction(plain, a));
    expect(JSON.stringify(restoredEvents)).toBe(JSON.stringify(liveEvents));
    expect(JSON.stringify(plainEvents)).toBe(JSON.stringify(liveEvents));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(live));
    expect(live.status).toBe('won');
  });

  it('rejects unknown state versions', () => {
    expect(() => deserializeState(JSON.stringify({ version: 1, state: {} }))).toThrow();
  });
});
