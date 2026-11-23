import { describe, expect, it } from 'vitest';
import { armPower, createLevelState, getLevel, listGroups, relicCells, tap } from '../core';
import type { CoreEvent, GemColor, LevelState, Pos, PowerLevel } from '../core';
import { TIMING, fallDuration, planTimeline, powerTiming, scrollDuration } from './timeline';

describe('planTimeline', () => {
  it('keeps a simple tap -> clear -> fall cycle under 450 ms', () => {
    const events: CoreEvent[] = [
      { type: 'cleared', cells: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }], color: 0, size: 3 },
      { type: 'fell', moves: [{ from: { x: 0, y: 4 }, to: { x: 0, y: 5 } }, { from: { x: 1, y: 2 }, to: { x: 1, y: 5 } }] },
    ];
    const plan = planTimeline(events);
    expect(plan.steps[0]!.at).toBe(0);
    expect(plan.steps[1]!.at).toBeGreaterThan(0);
    expect(plan.settleAt).toBeLessThan(450);
    expect(plan.hitStops).toEqual([]);
  });

  it('runs sequential steps in order and never overlaps them', () => {
    const events: CoreEvent[] = [
      { type: 'cleared', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: 1, size: 2 },
      { type: 'dirtDamaged', at: { x: 0, y: 1 }, hp: 0 },
      { type: 'fell', moves: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 3 } }] },
      { type: 'scrolled', rows: 2, scroll: 2 },
      { type: 'shuffled', cells: [] },
    ];
    const { steps, settleAt } = planTimeline(events);
    const [clear, dirt, fell, scroll, shuffle] = steps;
    expect(dirt!.at).toBeGreaterThan(clear!.at);
    expect(fell!.at).toBeGreaterThanOrEqual(dirt!.at + dirt!.block);
    expect(scroll!.at).toBe(fell!.at + fallDuration(3));
    expect(shuffle!.at).toBe(scroll!.at + scrollDuration(2));
    expect(settleAt).toBe(shuffle!.at + TIMING.shuffleMs);
  });

  it('adds a hit-stop after a relic reveal and delays what follows', () => {
    const events: CoreEvent[] = [
      { type: 'cleared', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: 1, size: 2 },
      { type: 'crustChipped', relicId: 0, crust: 0 },
      { type: 'relicCollected', relicId: 0, boon: 'chalice', bonus: false, collected: 1, goal: 1 },
      { type: 'powerCharged', color: 1, level: 1, index: 0, merged: false, source: 'group' },
      { type: 'fell', moves: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 1 } }] },
      { type: 'won', stars: 3 },
    ];
    const plan = planTimeline(events);
    const relic = plan.steps[2]!;
    expect(plan.hitStops).toEqual([relic.at]);
    expect(plan.steps[3]!.at).toBeGreaterThan(relic.at);
    expect(plan.steps[4]!.at).toBeGreaterThanOrEqual(relic.at + TIMING.hitStopMs);
    expect(plan.steps[5]!.at).toBe(plan.settleAt);
  });

  it('handles an empty event list', () => {
    expect(planTimeline([])).toEqual({ steps: [], hitStops: [], settleAt: 0 });
  });

  it('keeps the first taps on level 1 snappy', () => {
    const groups = listGroups(createLevelState(getLevel(1), [], 1));
    expect(groups.length).toBeGreaterThan(3);
    for (const g of groups.slice(0, 12)) {
      const sim = createLevelState(getLevel(1), [], 1);
      const res = tap(sim, g[0]!);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const plan = planTimeline(res.events);
      const scrolled = res.events.some((e) => e.type === 'scrolled');
      expect(plan.settleAt).toBeLessThan(scrolled ? 1100 : 450);
    }
  });

  it('waits for a boon reveal before its consequences', () => {
    const events: CoreEvent[] = [
      { type: 'cleared', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: 1, size: 2 },
      { type: 'crustChipped', relicId: 0, crust: 0 },
      { type: 'relicCollected', relicId: 0, boon: 'sun_coin', bonus: false, collected: 1, goal: 2 },
      { type: 'boonGained', boon: 'sun_coin', stacks: 1, relicId: 0 },
      { type: 'bonusMove', amount: 2, source: 'sun_coin' },
    ];
    const plan = planTimeline(events);
    const [, , relic, boon, bonus] = plan.steps;
    expect(boon!.at).toBe(relic!.at);
    expect(bonus!.at).toBeGreaterThanOrEqual(relic!.at + TIMING.hitStopMs + TIMING.boonChainMs);
  });
});

/** Fires a power of `color`/`level` at the first visible cell matching `pick` on a fresh attempt of `level`. */
function firePower(level: number, color: GemColor, lv: PowerLevel, pick: (s: LevelState) => Pos): { state: LevelState; events: CoreEvent[] } {
  const state = createLevelState(getLevel(level), [], 7);
  state.tray = [{ color, level: lv, seq: 99 }];
  armPower(state, 0);
  const res = tap(state, pick(state));
  if (!res.ok) throw new Error(res.reason);
  return { state, events: res.events };
}

describe('power choreography', () => {
  const mid = (s: LevelState): Pos => ({ x: 3, y: s.scroll + 5 });
  const cases: [string, GemColor][] = [['wildfire', 0], ['tidal', 1], ['earthshaker', 2], ['lightning', 3], ['drill', 4]];

  for (const [name, color] of cases) {
    for (const lv of [1, 3, 5] as PowerLevel[]) {
      it(`${name} Lv${lv}: short, ordered, and damage lands inside the effect`, () => {
        const { state, events } = firePower(6, color, lv, mid);
        const pt = events.find((e) => e.type === 'powerTriggered');
        expect(pt).toBeDefined();
        if (pt?.type !== 'powerTriggered') return;
        const t = powerTiming(pt);
        expect(t.duration).toBeGreaterThanOrEqual(400);
        expect(t.duration).toBeLessThanOrEqual(1000);
        const plan = planTimeline(events, { relicCells: (id) => {
          const r = state.relics.find((q) => q.id === id);
          return r ? relicCells(r) : null;
        } });
        const trig = plan.steps.find((s) => s.event.type === 'powerTriggered')!;
        for (const s of plan.steps) {
          if (s.event.type === 'dirtDamaged' || s.event.type === 'bedrockShattered' || s.event.type === 'crustChipped') {
            expect(s.at).toBeGreaterThanOrEqual(trig.at);
            expect(s.at).toBeLessThanOrEqual(trig.at + t.duration + TIMING.hitStopMs * 4 + TIMING.boonChainMs * 2);
          }
          if (s.event.type === 'fell' || s.event.type === 'scrolled') expect(s.at).toBeGreaterThanOrEqual(trig.at + t.duration);
        }
      });
    }
  }

  it('drill reaches deeper rows later', () => {
    const { events } = firePower(6, 4, 3, (s) => ({ x: 2, y: s.scroll + 1 }));
    const pt = events.find((e) => e.type === 'powerTriggered');
    if (pt?.type !== 'powerTriggered') throw new Error('no power');
    const t = powerTiming(pt);
    expect(t.hitTime({ x: 2, y: pt.at.y + 3 })).toBeGreaterThan(t.hitTime({ x: 2, y: pt.at.y + 1 }));
  });

  it('lightning starts at the first strike and the last one comes later', () => {
    const { events } = firePower(6, 3, 4, mid);
    const pt = events.find((e) => e.type === 'powerTriggered');
    if (pt?.type !== 'powerTriggered' || pt.effect.power !== 'lightning') throw new Error('no lightning');
    const t = powerTiming(pt);
    const first = pt.effect.strikes[0]!;
    expect(t.hitTime(first)).toBeLessThan(150);
    expect(t.duration).toBeGreaterThan(t.hitTime(first) + 300);
  });
});
