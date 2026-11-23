import { describe, expect, it } from 'vitest';
import { BASE_HEIGHT, BASE_WIDTH, MIN_CELL_CSS_DESKTOP, MIN_CELL_CSS_TOUCH, MIN_TOUCH_TARGET_CSS } from './config';
import { type Layout, type Rect, cellAt, cellCenter, computeLayout, expandGameSize, inside, overlaps, textureCellFor } from './layout';

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

function layoutFor(cssW: number, cssH: number, touch: boolean, safe = ZERO): Layout {
  const g = expandGameSize(cssW, cssH, BASE_WIDTH, BASE_HEIGHT);
  return computeLayout({ width: g.width, height: g.height, cssWidth: cssW, safe, touch });
}

function uiRects(l: Layout, cap: 3 | 4): Rect[] {
  return [l.frame, l.peek, l.hudPanel, l.boons, l.levelsBtn, l.perksBtn, l.settingsBtn, l.tray[cap].panel];
}

const SCREENS: [string, number, number, boolean][] = [
  ['phone 390x844', 390, 844, true],
  ['phone 360x640', 360, 640, true],
  ['iframe 800x450', 800, 450, false],
  ['desktop 1920x1080', 1920, 1080, false],
  ['desktop 1280x720', 1280, 720, false],
  ['landscape phone 844x390', 844, 390, true],
  ['tablet 768x1024', 768, 1024, true],
];

describe('computeLayout', () => {
  it.each(SCREENS)('%s: everything fits inside the safe area without overlaps', (_name, w, h, touch) => {
    const l = layoutFor(w, h, touch);
    for (const cap of [3, 4] as const) {
      for (const rc of uiRects(l, cap)) expect(inside(rc, l.safe)).toBe(true);
      expect(overlaps(l.frame, l.tray[cap].panel)).toBe(false);
      expect(overlaps(l.hudPanel, l.tray[cap].panel)).toBe(false);
      for (const s of l.tray[cap].slots) expect(inside(s, l.tray[cap].panel)).toBe(true);
    }
    expect(overlaps(l.frame, l.hudPanel)).toBe(false);
    expect(overlaps(l.levelsBtn, l.settingsBtn)).toBe(false);
    expect(overlaps(l.levelsBtn, l.perksBtn)).toBe(false);
    expect(overlaps(l.perksBtn, l.settingsBtn)).toBe(false);
    expect(overlaps(l.boons, l.frame)).toBe(false);
    if (l.mode === 'column') {
      expect(overlaps(l.title, l.perksBtn)).toBe(false);
      expect(overlaps(l.title, l.debugBtn)).toBe(false);
      expect(overlaps(l.boons, l.hudPanel)).toBe(false);
    } else {
      expect(inside(l.boons, l.hudPanel)).toBe(true);
    }
    expect(inside(l.board, l.frame)).toBe(true);
    expect(l.board.w).toBe(l.cell * 8);
    expect(l.board.h).toBe(l.cell * 10);
  });

  it('meets the minimum cell size on the target screens', () => {
    expect(layoutFor(390, 844, true).cellCss).toBeGreaterThanOrEqual(MIN_CELL_CSS_TOUCH);
    expect(layoutFor(800, 450, false).cellCss).toBeGreaterThanOrEqual(MIN_CELL_CSS_DESKTOP);
    expect(layoutFor(1920, 1080, false).cellCss).toBeGreaterThanOrEqual(MIN_CELL_CSS_DESKTOP);
    expect(layoutFor(1280, 720, false).cellCss).toBeGreaterThanOrEqual(MIN_CELL_CSS_DESKTOP);
  });

  it('uses the portrait column on phones and desktops, and the wide arrangement in a short iframe', () => {
    expect(layoutFor(390, 844, true).mode).toBe('column');
    expect(layoutFor(1920, 1080, false).mode).toBe('column');
    expect(layoutFor(800, 450, false).mode).toBe('wide');
    expect(layoutFor(844, 390, true).mode).toBe('wide');
  });

  it('keeps phone buttons at least 44 CSS px', () => {
    const l = layoutFor(390, 844, true);
    expect(l.levelsBtn.w / l.k).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS - 0.5);
    expect(l.settingsBtn.h / l.k).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS - 0.5);
    expect(l.perksBtn.w / l.k).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS - 0.5);
    // Power tray slots stay comfortably tappable with 4 slots (Tool Belt).
    for (const s of l.tray[4].slots) expect(Math.min(s.w, s.h) / l.k).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS);
  });

  it('centres the column horizontally on wide screens', () => {
    const l = layoutFor(1920, 1080, false);
    const mid = l.frame.x + l.frame.w / 2;
    expect(Math.abs(mid - l.width / 2)).toBeLessThan(2);
  });

  it('respects safe-area insets', () => {
    const safe = { top: 47, right: 0, bottom: 34, left: 0 };
    const l = layoutFor(390, 844, true, safe);
    expect(l.levelsBtn.y).toBeGreaterThanOrEqual(47 * l.k);
    expect(l.tray[4].panel.y + l.tray[4].panel.h).toBeLessThanOrEqual(l.height - 34 * l.k + 1);
  });
});

describe('cell mapping', () => {
  const l = layoutFor(390, 844, true);
  it('maps a cell centre back to the same cell, with scroll', () => {
    for (const scroll of [0, 7]) {
      const p = cellCenter(l, 3, scroll + 4, scroll);
      expect(cellAt(l, p.x, p.y, scroll)).toEqual({ x: 3, y: scroll + 4 });
    }
  });
  it('returns null off the board', () => {
    expect(cellAt(l, l.board.x - 1, l.board.y + 5, 0)).toBeNull();
    expect(cellAt(l, l.board.x + 5, l.board.y + l.board.h, 0)).toBeNull();
  });
});

describe('textureCellFor', () => {
  it('quantises to 4 px and clamps', () => {
    expect(textureCellFor(81)).toBe(84);
    expect(textureCellFor(84)).toBe(84);
    expect(textureCellFor(5)).toBe(16);
    expect(textureCellFor(1000)).toBe(192);
  });
});
