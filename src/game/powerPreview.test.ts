// The armed-power preview must show exactly the cells the core power acts on (for the deterministic powers).
import { describe, expect, it } from 'vitest';
import { armPower, cloneState, createLevelState, getLevel, tap } from '../core';
import type { GemColor, LevelState, Pos, PowerLevel } from '../core';
import { previewPower } from './powerPreview';

const key = (cells: readonly Pos[]) => cells.map((p) => `${p.x},${p.y}`).sort().join(' ');

function armed(color: GemColor, level: PowerLevel, perks: Parameters<typeof createLevelState>[1] = []): LevelState {
  const s = createLevelState(getLevel(7), perks, 3);
  s.tray = [{ color, level, seq: 1 }];
  armPower(s, 0);
  return s;
}

function fired(s: LevelState, at: Pos) {
  const sim = cloneState(s);
  const res = tap(sim, at);
  if (!res.ok) throw new Error(res.reason);
  const e = res.events.find((x) => x.type === 'powerTriggered');
  if (e?.type !== 'powerTriggered') throw new Error('no power');
  return e;
}

describe('previewPower', () => {
  const targets = (s: LevelState): Pos[] => [{ x: 0, y: s.scroll }, { x: 3, y: s.scroll + 4 }, { x: 7, y: s.scroll + 9 }, { x: 5, y: s.scroll + 7 }];

  for (const level of [1, 2, 3, 4, 5] as PowerLevel[]) {
    it(`tidal Lv${level} matches the swept lines`, () => {
      const s = armed(1, level);
      for (const at of targets(s)) expect(key(previewPower(s, at)!.cells)).toBe(key(fired(s, at).cells));
    });
    it(`drill Lv${level} matches the bored path`, () => {
      const s = armed(4, level);
      for (const at of targets(s)) {
        const e = fired(s, at);
        if (e.effect.power !== 'drill') throw new Error('not a drill');
        expect(key(previewPower(s, at)!.cells)).toBe(key(e.effect.path));
      }
    });
    it(`earthshaker Lv${level} matches the shaken area`, () => {
      const s = armed(2, level);
      for (const at of targets(s)) {
        const e = fired(s, at);
        if (e.effect.power !== 'earthshaker') throw new Error('not a shaker');
        expect(key(previewPower(s, at)!.cells)).toBe(key(e.effect.area));
      }
    });
  }

  it('wildfire previews the tapped group, lightning the tapped cell', () => {
    const s = armed(0, 2);
    const at = { x: 3, y: s.scroll + 4 };
    const e = fired(s, at);
    if (e.effect.power !== 'wildfire') throw new Error('not wildfire');
    const pv = previewPower(s, at)!;
    if (e.effect.group.length) expect(key(pv.cells)).toBe(key(e.effect.group));
    const l = armed(3, 1);
    expect(previewPower(l, at)!.cells).toEqual([at]);
  });

  it('Tempered previews one level stronger', () => {
    const s = armed(4, 1, ['smith_tempered']);
    const at = { x: 2, y: s.scroll };
    expect(previewPower(s, at)!.level).toBe(2);
    expect(previewPower(s, at)!.cells).toHaveLength(5);
  });

  it('is null when nothing is armed or the cell is out of view', () => {
    const s = createLevelState(getLevel(7), [], 3);
    expect(previewPower(s, { x: 0, y: s.scroll })).toBeNull();
    const a = armed(1, 1);
    expect(previewPower(a, { x: 0, y: a.scroll + 10 })).toBeNull();
  });
});
