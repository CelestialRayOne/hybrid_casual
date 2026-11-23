// Screen layout maths (pure, unit-tested). Everything is in GAME px (canvas px under Scale.EXPAND);
// `k` converts CSS px to game px. Recomputed from the live game size + safe area on every resize.
//
// Two arrangements:
// - 'column': the portrait column (top bar, HUD panel, boons row, board, relic peek strip, power tray) centred
//   on screen. Used whenever its cell size meets the minimum (40 CSS px touch / 32 desktop).
// - 'wide': for short landscape frames (e.g. an 800x450 iframe) where the column would be too small: the board
//   stays in the middle at full height, the HUD moves to a left panel and the tray to a right panel.
import { COLUMNS, VISIBLE_ROWS } from '../core/types';
import { MAX_CELL_CSS, MIN_CELL_CSS_DESKTOP, MIN_CELL_CSS_TOUCH, MIN_TOUCH_TARGET_CSS } from './config';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  /** Game size (canvas px). */
  width: number;
  height: number;
  /** Displayed canvas width in CSS px (game px per CSS px = width / cssWidth). */
  cssWidth: number;
  /** Safe-area insets in CSS px. */
  safe: Insets;
  touch: boolean;
}

export interface TrayLayout {
  panel: Rect;
  slots: Rect[];
  vertical: boolean;
}

export interface Layout {
  mode: 'column' | 'wide';
  width: number;
  height: number;
  /** Game px per CSS px. */
  k: number;
  /** Cell size in game px (integer). */
  cell: number;
  cellCss: number;
  /** Safe rect in game px. */
  safe: Rect;
  /** Bounding box of all play UI (used to centre overlays). */
  play: Rect;
  board: Rect;
  /** Board plus its frame padding. */
  frame: Rect;
  /** Strip under the board showing relic outlines below the visible window. */
  peek: Rect;
  hudPanel: Rect;
  title: Rect;
  levelsBtn: Rect;
  perksBtn: Rect;
  settingsBtn: Rect;
  debugBtn: Rect;
  moves: Rect;
  depth: Rect;
  relics: Rect;
  /** Row of collected boons (icons with stack counts). */
  boons: Rect;
  /** Power tray layouts for a capacity of 3 and of 4 slots (Tool Belt). */
  tray: { 3: TrayLayout; 4: TrayLayout };
  /** Minimum button size in game px. */
  touchTarget: number;
}

/** Vertical/horizontal budgets in cell units (excluding the top-bar button height, which may exceed 0.95c). */
const COL = {
  margin: 0.2,
  framePad: 0.22,
  barGap: 0.12,
  hudH: 1.15,
  boonGap: 0.05,
  boonH: 0.8,
  boardGap: 0.06,
  peekGap: 0.04,
  peekH: 0.55,
  trayGap: 0.1,
  trayH: 1.95,
  sideMargin: 0.15,
} as const;

const WIDE = {
  margin: 0.25,
  framePad: 0.22,
  side: 3.5,
  gap: 0.35,
  peekGap: 0.04,
  peekH: 0.55,
} as const;

const r = Math.round;

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

/** Column cell size for a safe area (game px), given the minimum button size. */
function columnCell(safeW: number, safeH: number, target: number): number {
  const fixedRows = COL.margin * 2 + COL.barGap + COL.hudH + COL.boonGap + COL.boonH + COL.boardGap + 10 + COL.framePad * 2 +
    COL.peekGap + COL.peekH + COL.trayGap + COL.trayH;
  const widthUnits = COLUMNS + COL.framePad * 2 + COL.sideMargin * 2;
  let c = Math.min(safeW / widthUnits, safeH / (fixedRows + 0.95));
  if (target > 0.95 * c) c = Math.min(c, (safeH - target) / fixedRows);
  return c;
}

function wideCell(safeW: number, safeH: number): number {
  const w = WIDE.margin * 2 + WIDE.side * 2 + WIDE.gap * 2 + COLUMNS + WIDE.framePad * 2;
  const h = WIDE.margin * 2 + VISIBLE_ROWS + WIDE.framePad * 2 + WIDE.peekGap + WIDE.peekH;
  return Math.min(safeW / w, safeH / h);
}

export function computeLayout(input: LayoutInput): Layout {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const k = input.cssWidth > 0 ? width / input.cssWidth : 1;
  const s = input.safe;
  const safe = rect(s.left * k, s.top * k, width - (s.left + s.right) * k, height - (s.top + s.bottom) * k);
  const target = (input.touch ? MIN_TOUCH_TARGET_CSS : 36) * k;
  const minCell = (input.touch ? MIN_CELL_CSS_TOUCH : MIN_CELL_CSS_DESKTOP) * k;
  const maxCell = MAX_CELL_CSS * k;

  const colC = columnCell(safe.w, safe.h, target);
  const wideC = wideCell(safe.w, safe.h);
  const mode: Layout['mode'] = colC >= minCell || wideC <= colC ? 'column' : 'wide';
  const cell = Math.max(8, Math.floor(Math.min(maxCell, mode === 'column' ? colC : wideC)));
  const base = { width, height, k, cell, cellCss: cell / k, safe, touchTarget: r(target) };
  return mode === 'column' ? columnLayout(base) : wideLayout(base);
}

type Base = Pick<Layout, 'width' | 'height' | 'k' | 'cell' | 'cellCss' | 'safe' | 'touchTarget'>;

function traySlots(panel: Rect, n: number, c: number, vertical: boolean): Rect[] {
  const pad = 0.22 * c;
  const gap = 0.2 * c;
  const out: Rect[] = [];
  if (vertical) {
    const h = (panel.h - pad * 2 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push(rect(panel.x + pad, panel.y + pad + i * (h + gap), panel.w - pad * 2, h));
  } else {
    const w = (panel.w - pad * 2 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push(rect(panel.x + pad + i * (w + gap), panel.y + pad, w, panel.h - pad * 2));
  }
  return out;
}

function columnLayout(b: Base): Layout {
  const c = b.cell;
  const fp = COL.framePad * c;
  const colW = COLUMNS * c + fp * 2;
  const bar = Math.max(0.95 * c, b.touchTarget);
  const total =
    COL.margin * c * 2 + bar + COL.barGap * c + COL.hudH * c + (COL.boonGap + COL.boonH + COL.boardGap) * c + 10 * c + fp * 2 +
    COL.peekGap * c + COL.peekH * c + COL.trayGap * c + COL.trayH * c;
  const x0 = b.safe.x + (b.safe.w - colW) / 2;
  // Centre vertically, biased slightly upwards on tall screens (thumb reach is better for the tray low down).
  const spare = Math.max(0, b.safe.h - total);
  let y = b.safe.y + spare * 0.45 + COL.margin * c;

  const btnGap = 0.15 * c;
  const levelsBtn = rect(x0, y, bar, bar);
  const perksBtn = rect(x0 + bar + btnGap, y, bar, bar);
  const settingsBtn = rect(x0 + colW - bar, y, bar, bar);
  const debugBtn = rect(x0 + colW - bar * 2 - btnGap, y, bar, bar);
  // Symmetric so the title stays centred between two buttons per side.
  const title = rect(x0 + bar * 2 + btnGap + 0.1 * c, y, colW - bar * 4 - btnGap * 2 - 0.2 * c, bar);
  y += bar + COL.barGap * c;

  const hudPanel = rect(x0, y, colW, COL.hudH * c);
  const statW = 1.95 * c;
  const moves = rect(x0 + 0.15 * c, y, statW, COL.hudH * c);
  const depth = rect(x0 + colW - 0.15 * c - statW, y, statW, COL.hudH * c);
  const relics = rect(moves.x + statW, y, depth.x - (moves.x + statW), COL.hudH * c);
  y += COL.hudH * c + COL.boonGap * c;
  const boons = rect(x0, y, colW, COL.boonH * c);
  y += (COL.boonH + COL.boardGap) * c;

  const frame = rect(x0, y, colW, 10 * c + fp * 2);
  const board = rect(x0 + fp, y + fp, COLUMNS * c, VISIBLE_ROWS * c);
  y += 10 * c + fp * 2 + COL.peekGap * c;
  const peek = rect(board.x, y, board.w, COL.peekH * c);
  y += COL.peekH * c + COL.trayGap * c;

  const trayPanel = rect(x0, y, colW, COL.trayH * c);
  const tray = {
    3: { panel: trayPanel, slots: traySlots(trayPanel, 3, c, false), vertical: false },
    4: { panel: trayPanel, slots: traySlots(trayPanel, 4, c, false), vertical: false },
  };
  const play = rect(x0, levelsBtn.y, colW, trayPanel.y + trayPanel.h - levelsBtn.y);
  return {
    ...b, mode: 'column', play, board, frame, peek, hudPanel, title, levelsBtn, perksBtn, settingsBtn, debugBtn, moves, depth,
    relics, boons, tray,
  };
}

function wideLayout(b: Base): Layout {
  const c = b.cell;
  const fp = WIDE.framePad * c;
  const frameW = COLUMNS * c + fp * 2;
  const frameH = VISIBLE_ROWS * c + fp * 2;
  const side = WIDE.side * c;
  const totalW = side * 2 + WIDE.gap * c * 2 + frameW;
  const totalH = frameH + (WIDE.peekGap + WIDE.peekH) * c;
  const x0 = b.safe.x + (b.safe.w - totalW) / 2;
  const y0 = b.safe.y + (b.safe.h - totalH) / 2;

  const fx = x0 + side + WIDE.gap * c;
  const frame = rect(fx, y0, frameW, frameH);
  const board = rect(fx + fp, y0 + fp, COLUMNS * c, VISIBLE_ROWS * c);
  const peek = rect(board.x, y0 + frameH + WIDE.peekGap * c, board.w, WIDE.peekH * c);

  // Left HUD panel: buttons row (levels, perks, settings), title, moves, depth, relics, boons.
  const pad = 0.25 * c;
  const btnGap = 0.12 * c;
  const bar = Math.min(Math.max(0.95 * c, b.touchTarget), (side - pad * 2 - btnGap * 2) / 3);
  let y = y0 + pad;
  const levelsBtn = rect(x0 + pad, y, bar, bar);
  const perksBtn = rect(x0 + side / 2 - bar / 2, y, bar, bar);
  const settingsBtn = rect(x0 + side - pad - bar, y, bar, bar);
  y += bar + 0.15 * c;
  const title = rect(x0 + pad, y, side - pad * 2, 0.8 * c);
  y += 0.8 * c + 0.1 * c;
  const moves = rect(x0 + pad, y, side - pad * 2, 0.95 * c);
  y += 0.95 * c;
  const depth = rect(x0 + pad, y, side - pad * 2, 0.95 * c);
  y += 0.95 * c + 0.1 * c;
  const relics = rect(x0 + pad, y, side - pad * 2, 1.05 * c);
  y += 1.05 * c + 0.1 * c;
  const boons = rect(x0 + pad, y, side - pad * 2, 1.6 * c);
  y += 1.6 * c + pad;
  const hudPanel = rect(x0, y0, side, y - y0);
  const debugBtn = rect(x0 + (side - bar) / 2, y + 0.2 * c, bar, bar);

  const trayFor = (n: number): TrayLayout => {
    const slotH = 2.1 * c;
    const h = 0.44 * c + n * slotH + (n - 1) * 0.2 * c;
    const panel = rect(fx + frameW + WIDE.gap * c, y0 + (frameH - h) / 2, side, h);
    return { panel, slots: traySlots(panel, n, c, true), vertical: true };
  };
  const play = rect(x0, y0, totalW, totalH);
  return {
    ...b, mode: 'wide', play, board, frame, peek, hudPanel, title, levelsBtn, perksBtn, settingsBtn, debugBtn, moves, depth,
    relics, boons, tray: { 3: trayFor(3), 4: trayFor(4) },
  };
}

/** Board cell (level coordinates) under a game-px point, or null outside the board. `scroll` = top visible row. */
export function cellAt(layout: Pick<Layout, 'board' | 'cell'>, px: number, py: number, scroll: number): { x: number; y: number } | null {
  const { board, cell } = layout;
  if (px < board.x || py < board.y || px >= board.x + board.w || py >= board.y + board.h) return null;
  return { x: Math.floor((px - board.x) / cell), y: Math.floor((py - board.y) / cell) + scroll };
}

/** Like cellAt but without the on-board check (may return off-board coordinates). */
export function cellAtUnclamped(layout: Pick<Layout, 'board' | 'cell'>, px: number, py: number, scroll: number): { x: number; y: number } {
  const { board, cell } = layout;
  return { x: Math.floor((px - board.x) / cell), y: Math.floor((py - board.y) / cell) + scroll };
}

/** Screen-space centre (game px) of a level cell for a given (possibly fractional) scroll. */
export function cellCenter(layout: Pick<Layout, 'board' | 'cell'>, x: number, y: number, scroll: number): { x: number; y: number } {
  const { board, cell } = layout;
  return { x: board.x + x * cell + cell / 2, y: board.y + (y - scroll) * cell + cell / 2 };
}

export function contains(rc: Rect, x: number, y: number): boolean {
  return x >= rc.x && y >= rc.y && x < rc.x + rc.w && y < rc.y + rc.h;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function inside(inner: Rect, outer: Rect, tolerance = 1): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

/**
 * Texture cell size for the art atlas: the on-screen cell in canvas px, quantised to 4 px so small resizes don't
 * trigger a regeneration (sprites are drawn with setDisplaySize, so a few % of scaling is invisible).
 */
export function textureCellFor(cell: number): number {
  return Math.max(16, Math.min(192, Math.ceil(cell / 4) * 4));
}

/** The game size Phaser's Scale.EXPAND produces for a parent of cssW x cssH (mirrors ScaleManager; for tests/tools). */
export function expandGameSize(cssW: number, cssH: number, baseW: number, baseH: number): { width: number; height: number } {
  const sx = cssW / baseW;
  const sy = cssH / baseH;
  return sx < sy ? { width: baseW, height: cssH / sx } : { width: cssW / sy, height: baseH };
}
