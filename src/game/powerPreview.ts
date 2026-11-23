// Where an armed power will act if fired at a cell (pure, unit-tested): drawn under the reticle so the player sees
// the shape before committing. Mirrors the core rules (src/core/powers.ts); random parts (how far Wildfire spreads,
// which gems Chain Lightning picks) are not previewed, only their sure part (the tapped group / the tapped gem).
import { COLUMNS, DRILL_ROWS, SHAKER_RADIUS, TIDAL_LINES, VISIBLE_ROWS, findGroup, isVisible, powerKind } from '../core';
import type { LevelState, Pos, PowerKind, PowerLevel } from '../core';

export interface PowerPreview {
  power: PowerKind;
  level: PowerLevel;
  /** Cells the power certainly acts on (visible only). */
  cells: Pos[];
}

/** Effective trigger level (Tempered adds 1, capped at 5). */
export function effectiveLevel(state: LevelState, level: PowerLevel): PowerLevel {
  return Math.min(5, level + state.rules.temperedBonus) as PowerLevel;
}

export function previewPower(state: LevelState, at: Pos): PowerPreview | null {
  if (state.armed === null) return null;
  const p = state.tray[state.armed];
  if (!p || !isVisible(state, at.x, at.y)) return null;
  const level = effectiveLevel(state, p.level);
  const power = powerKind(p.color);
  const top = state.scroll;
  const bottom = Math.min(state.scroll + VISIBLE_ROWS, state.grid.length) - 1;
  const cells: Pos[] = [];
  const push = (x: number, y: number) => {
    if (x >= 0 && x < COLUMNS && y >= top && y <= bottom) cells.push({ x, y });
  };
  switch (power) {
    case 'wildfire':
    case 'earthshaker': {
      const group = findGroup(state, at);
      const origin = group.length ? group : [at];
      if (power === 'wildfire') {
        cells.push(...origin.map((q) => ({ ...q })));
        break;
      }
      const r = SHAKER_RADIUS[level - 1] ?? 1;
      for (let y = top; y <= bottom; y++) {
        for (let x = 0; x < COLUMNS; x++) {
          if (origin.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= r)) push(x, y);
        }
      }
      break;
    }
    case 'tidal': {
      const pat = TIDAL_LINES[level - 1] ?? { rows: [0], cols: [] };
      const rows = pat.rows.map((d) => at.y + d);
      const cols = pat.cols.map((d) => at.x + d);
      for (let y = top; y <= bottom; y++) {
        for (let x = 0; x < COLUMNS; x++) if (rows.includes(y) || cols.includes(x)) push(x, y);
      }
      break;
    }
    case 'lightning':
      push(at.x, at.y);
      break;
    case 'drill': {
      const rows = DRILL_ROWS[level - 1] ?? 3;
      const cols = level === 5 ? [at.x - 1, at.x, at.x + 1] : [at.x];
      for (let y = at.y; y <= Math.min(at.y + rows - 1, bottom); y++) for (const x of cols) push(x, y);
      break;
    }
  }
  return { power, level, cells };
}
